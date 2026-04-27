/**
 * GET /api/leads-admin
 * Список лидов из Postgres + управление воронкой.
 * Защищён ADMIN_SECRET.
 *
 * Query params (GET):
 *   secret      — обязательно
 *   offset      — пагинация (default 0)
 *   limit       — (default 50)
 *   status      — фильтр по статусу
 *   lead_id     — показать полный лид с шаблонами и кейсом
 *
 * Query params (POST):
 *   secret, action, lead_id
 *
 * Actions:
 *   pause | resume | convert | delete
 *   send_message (body: { text })
 *   schedule_call (body: { call_time_iso, zoom_url, call_note? })
 *   call_completed
 *   cancel_call
 */

import { getDb, genId } from '../lib/db.js';
import { recommendCase } from '../lib/cases.js';
import { buildTemplates, buildCallReminder, buildCallFollowup } from '../lib/message-templates.js';

const BOT_USERNAME = 'artofsales_shamil_bot';

async function tgSend(token, chatId, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    return r.json();
  } catch (e) {
    console.error('tgSend error:', e.message);
  }
}

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  return {};
}

export default async function handler(req, res) {
  const secret   = process.env.ADMIN_SECRET;
  const provided = req.query.secret || req.headers['x-admin-secret'] ||
                   (req.body && req.body.secret);
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sql       = getDb();
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

  // ── POST — действия над лидом ─────────────────────────────────────────────
  if (req.method === 'POST') {
    const body    = parseBody(req);
    const action  = body.action || req.query.action;
    const lead_id = body.lead_id || req.query.lead_id;

    if (!action || !lead_id) {
      return res.status(400).json({ error: 'action and lead_id required' });
    }

    try {
      // ── Pause/Resume/Convert/Delete ──────────────────────────────────────
      if (action === 'pause') {
        await sql`UPDATE drip_schedule SET paused = TRUE WHERE lead_id = ${lead_id} AND sent_at IS NULL AND type = 'drip'`;
        return res.status(200).json({ ok: true });
      }
      if (action === 'resume') {
        await sql`UPDATE drip_schedule SET paused = FALSE WHERE lead_id = ${lead_id} AND sent_at IS NULL AND type = 'drip'`;
        await sql`UPDATE leads SET status = 'active' WHERE id = ${lead_id} AND status IN ('engaged','cold')`;
        return res.status(200).json({ ok: true });
      }
      if (action === 'convert') {
        await sql`UPDATE leads SET status = 'converted', converted_at = NOW() WHERE id = ${lead_id}`;
        await sql`UPDATE drip_schedule SET paused = TRUE WHERE lead_id = ${lead_id} AND sent_at IS NULL`;
        return res.status(200).json({ ok: true });
      }
      if (action === 'paid') {
        await sql`UPDATE leads SET status = 'paid', converted_at = NOW() WHERE id = ${lead_id}`;
        await sql`UPDATE drip_schedule SET paused = TRUE WHERE lead_id = ${lead_id} AND sent_at IS NULL`;
        return res.status(200).json({ ok: true });
      }
      if (action === 'lost') {
        await sql`UPDATE leads SET status = 'lost' WHERE id = ${lead_id}`;
        await sql`UPDATE drip_schedule SET paused = TRUE WHERE lead_id = ${lead_id} AND sent_at IS NULL`;
        return res.status(200).json({ ok: true });
      }
      if (action === 'delete') {
        await sql`DELETE FROM leads WHERE id = ${lead_id}`;
        return res.status(200).json({ ok: true });
      }

      // ── Отправить сообщение от бота ──────────────────────────────────────
      if (action === 'send_message') {
        const text = body.text || '';
        if (!text.trim()) return res.status(400).json({ error: 'text required' });
        if (!BOT_TOKEN) return res.status(500).json({ error: 'BOT_TOKEN not set' });

        const [lead] = await sql`SELECT tg_user_id, status FROM leads WHERE id = ${lead_id} LIMIT 1`;
        if (!lead?.tg_user_id) return res.status(400).json({ error: 'Lead has no tg_user_id (not opened bot yet)' });

        const result = await tgSend(BOT_TOKEN, lead.tg_user_id, text);
        if (!result?.ok) return res.status(500).json({ error: 'Telegram send failed', detail: result?.description });

        await sql`UPDATE leads SET status = 'reached_out' WHERE id = ${lead_id} AND status IN ('new','active')`;
        await sql`
          INSERT INTO events (id, lead_id, type, payload)
          VALUES (${genId('ev')}, ${lead_id}, 'message_sent_from_admin',
                  ${JSON.stringify({ text: text.slice(0, 200) })}::jsonb)
        `;
        return res.status(200).json({ ok: true });
      }

      // ── Назначить созвон ─────────────────────────────────────────────────
      if (action === 'schedule_call') {
        const { call_time_iso, zoom_url, call_note } = body;
        if (!call_time_iso || !zoom_url) {
          return res.status(400).json({ error: 'call_time_iso and zoom_url required' });
        }
        const callTime = new Date(call_time_iso);
        if (isNaN(callTime)) return res.status(400).json({ error: 'Invalid call_time_iso' });

        const [lead] = await sql`SELECT * FROM leads WHERE id = ${lead_id} LIMIT 1`;
        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        // Удаляем старые неотправленные call_reminder записи
        await sql`DELETE FROM drip_schedule WHERE lead_id = ${lead_id} AND type = 'call_reminder' AND sent_at IS NULL`;

        // Сохраняем данные созвона
        await sql`
          UPDATE leads SET
            call_scheduled_at = ${callTime.toISOString()},
            call_completed    = FALSE,
            call_zoom_url     = ${zoom_url},
            call_note         = ${call_note || null},
            status            = 'call_scheduled'
          WHERE id = ${lead_id}
        `;

        // Ставим основную drip-воронку на паузу
        await sql`UPDATE drip_schedule SET paused = TRUE WHERE lead_id = ${lead_id} AND sent_at IS NULL AND type = 'drip'`;

        // Создаём 3 напоминания
        const reminders = [
          { offset: -24 * 3600 * 1000, type_key: '24h' },
          { offset: -2  * 3600 * 1000, type_key: '2h'  },
          { offset: -15 * 60    * 1000, type_key: '15min' },
        ];

        for (const { offset, type_key } of reminders) {
          const sendAt = new Date(callTime.getTime() + offset);
          if (sendAt > new Date()) {  // не создаём если время уже прошло
            const text = buildCallReminder({
              name      : lead.name || '',
              call_time : callTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
              zoom_url,
              type      : type_key,
            });
            await sql`
              INSERT INTO drip_schedule (id, lead_id, step, send_at, message_key, type)
              VALUES (${genId('drip')}, ${lead_id}, 0, ${sendAt.toISOString()}, ${'call_reminder_' + type_key}, 'call_reminder')
            `;
            // Сохраняем текст напоминания в events
            await sql`
              INSERT INTO events (id, lead_id, type, payload)
              VALUES (${genId('ev')}, ${lead_id}, 'call_reminder_created',
                      ${JSON.stringify({ reminder_type: type_key, send_at: sendAt.toISOString(), text })}::jsonb)
            `;
          }
        }

        return res.status(200).json({ ok: true, call_scheduled_at: callTime.toISOString() });
      }

      // ── Созвон прошёл ────────────────────────────────────────────────────
      if (action === 'call_completed') {
        await sql`UPDATE leads SET call_completed = TRUE, status = 'call_done' WHERE id = ${lead_id}`;
        // Отменяем неотправленные напоминания
        await sql`UPDATE drip_schedule SET paused = TRUE WHERE lead_id = ${lead_id} AND type = 'call_reminder' AND sent_at IS NULL`;

        const [lead] = await sql`SELECT * FROM leads WHERE id = ${lead_id} LIMIT 1`;

        // Создаём follow-up через 24 часа
        if (lead?.tg_user_id) {
          const followupAt = new Date(Date.now() + 24 * 3600 * 1000);
          await sql`
            INSERT INTO drip_schedule (id, lead_id, step, send_at, message_key, type)
            VALUES (${genId('drip')}, ${lead_id}, 0, ${followupAt.toISOString()}, 'call_followup_24h', 'call_followup')
          `;
        }

        await sql`
          INSERT INTO events (id, lead_id, type, payload)
          VALUES (${genId('ev')}, ${lead_id}, 'call_completed', ${JSON.stringify({})}::jsonb)
        `;
        return res.status(200).json({ ok: true });
      }

      // ── Отменить созвон ──────────────────────────────────────────────────
      if (action === 'cancel_call') {
        await sql`UPDATE leads SET call_scheduled_at = NULL, call_zoom_url = NULL, status = 'active' WHERE id = ${lead_id}`;
        await sql`UPDATE drip_schedule SET paused = TRUE WHERE lead_id = ${lead_id} AND type = 'call_reminder' AND sent_at IS NULL`;
        await sql`UPDATE drip_schedule SET paused = FALSE WHERE lead_id = ${lead_id} AND type = 'drip' AND sent_at IS NULL`;
        return res.status(200).json({ ok: true });
      }

      // ── Сохранить финальный ответ ────────────────────────────────────────
      if (action === 'save_draft') {
        const { draft } = body;
        await sql`UPDATE leads SET ai_draft = ${draft || ''} WHERE id = ${lead_id}`;
        return res.status(200).json({ ok: true });
      }

      if (action === 'save_final') {
        const { final_answer } = body;
        await sql`UPDATE leads SET final_answer = ${final_answer || ''} WHERE id = ${lead_id}`;
        return res.status(200).json({ ok: true });
      }

      // ── Отправить финальный ответ клиенту ───────────────────────────────
      if (action === 'send_final') {
        if (!BOT_TOKEN) return res.status(500).json({ error: 'BOT_TOKEN not set' });
        const [lead] = await sql`SELECT * FROM leads WHERE id = ${lead_id} LIMIT 1`;
        if (!lead?.tg_user_id) return res.status(400).json({ error: 'Lead has no tg_user_id' });

        const text = lead.final_answer || lead.ai_draft;
        if (!text?.trim()) return res.status(400).json({ error: 'No final_answer or ai_draft to send' });

        const result = await tgSend(BOT_TOKEN, lead.tg_user_id, text);
        if (!result?.ok) return res.status(500).json({ error: 'Telegram send failed', detail: result?.description });

        await sql`UPDATE leads SET status = 'reached_out' WHERE id = ${lead_id} AND status IN ('new','active')`;
        await sql`
          INSERT INTO events (id, lead_id, type, payload)
          VALUES (${genId('ev')}, ${lead_id}, 'final_answer_sent', ${JSON.stringify({ length: text.length })}::jsonb)
        `;
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });

    } catch (err) {
      console.error('leads-admin POST error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET ────────────────────────────────────────────────────────────────────

  // Детальный просмотр одного лида (с шаблонами и рекомендацией)
  const detail_lead_id = req.query.lead_id;
  if (detail_lead_id && !req.query.action) {
    try {
      const rows = await sql`SELECT * FROM leads WHERE id = ${detail_lead_id} LIMIT 1`;
      const lead = rows[0];
      if (!lead) return res.status(404).json({ error: 'Lead not found' });

      const scheduleRows = await sql`
        SELECT id, step, send_at, sent_at, paused, message_key, type
        FROM drip_schedule WHERE lead_id = ${detail_lead_id}
        ORDER BY send_at ASC
      `;

      const caseRec = recommendCase(lead.quiz_answers || {});
      const templates = buildTemplates({
        name        : lead.name || '',
        q5          : lead.quiz_answers?.q5 || '',
        q7          : lead.quiz_answers?.q7 || '',
        q1          : lead.quiz_answers?.q1 || '',
        case_name   : caseRec?.name || '',
        case_result : caseRec?.result || '',
        case_before : caseRec?.before || '',
      });

      return res.status(200).json({
        lead,
        drip_schedule : scheduleRows,
        recommended_case: caseRec,
        templates,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET ?action=pause|resume|convert|delete (legacy query-param style)
  const { action, lead_id } = req.query;
  if (action && lead_id) {
    // Redirect to POST handler logic for legacy compatibility
    req.body = { action, lead_id, secret: provided };
    req.method = 'POST';
    return handler(req, res);
  }

  // Список лидов
  try {
    const offset       = parseInt(req.query.offset || '0', 10);
    const limit        = parseInt(req.query.limit  || '50', 10);
    const statusFilter = req.query.status;

    const [{ total }] = statusFilter
      ? await sql`SELECT COUNT(*) AS total FROM leads WHERE status = ${statusFilter}`
      : await sql`SELECT COUNT(*) AS total FROM leads`;

    // Используем message_key LIKE 'msg_%' вместо ds.type = 'drip'
    // — работает и без migration_v2.sql (колонки type может не быть)
    const leads = statusFilter
      ? await sql`
          SELECT l.*,
            (SELECT COUNT(*) FROM drip_schedule ds WHERE ds.lead_id = l.id AND ds.sent_at IS NOT NULL AND ds.message_key LIKE 'msg_%') AS msgs_sent,
            (SELECT MAX(ds.step) FROM drip_schedule ds WHERE ds.lead_id = l.id AND ds.sent_at IS NOT NULL AND ds.message_key LIKE 'msg_%') AS current_step
          FROM leads l WHERE l.status = ${statusFilter}
          ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${offset}
        `
      : await sql`
          SELECT l.*,
            (SELECT COUNT(*) FROM drip_schedule ds WHERE ds.lead_id = l.id AND ds.sent_at IS NOT NULL AND ds.message_key LIKE 'msg_%') AS msgs_sent,
            (SELECT MAX(ds.step) FROM drip_schedule ds WHERE ds.lead_id = l.id AND ds.sent_at IS NOT NULL AND ds.message_key LIKE 'msg_%') AS current_step
          FROM leads l
          ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${offset}
        `;

    return res.status(200).json({ total: Number(total), offset, limit, items: leads });
  } catch (err) {
    console.error('leads-admin GET error:', err.message);
    // Возвращаем ошибку с деталями чтобы видеть в браузере что именно сломалось
    return res.status(500).json({ error: err.message, hint: 'Проверь DATABASE_URL в Vercel и запусти db/migration_v2.sql в Neon SQL Editor' });
  }
}
