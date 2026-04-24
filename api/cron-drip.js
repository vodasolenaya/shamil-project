/**
 * GET /api/cron-drip
 * Запускается Vercel Cron каждый час (schedule: "0 * * * *")
 * Находит все неотправленные сообщения, у которых send_at <= NOW(),
 * и отправляет их через Telegram.
 */

import { getDb, genId } from '../lib/db.js';
import { getMessage } from '../lib/messages.js';
import { buildCallFollowup } from '../lib/message-templates.js';

async function tgSend(token, chatId, text, reply_markup) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (reply_markup) body.reply_markup = reply_markup;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!d.ok) console.error('TG error:', d.description);
    return d;
  } catch (e) {
    console.error('tgSend error:', e.message);
  }
}

export default async function handler(req, res) {
  // Vercel Cron шлёт GET, защищаем секретом
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).json({ error: 'BOT_TOKEN not set' });

  const sql = getDb();

  // Ищем все pending сообщения (drip + call_reminder + call_followup)
  const pending = await sql`
    SELECT
      ds.id          AS drip_id,
      ds.lead_id,
      ds.step,
      ds.message_key,
      ds.type        AS ds_type,
      l.tg_user_id,
      l.name,
      l.quiz_answers,
      l.status       AS lead_status,
      l.call_zoom_url,
      l.call_scheduled_at,
      l.call_completed,
      l.final_answer,
      (SELECT payload FROM events
       WHERE lead_id = l.id AND type = 'call_reminder_created'
         AND payload->>'reminder_type' = regexp_replace(ds.message_key, 'call_reminder_', '')
       ORDER BY created_at DESC LIMIT 1) AS reminder_payload
    FROM drip_schedule ds
    JOIN leads l ON l.id = ds.lead_id
    WHERE ds.sent_at IS NULL
      AND ds.paused   = FALSE
      AND ds.send_at <= NOW()
      AND l.status NOT IN ('unsubscribed', 'converted', 'paid', 'lost')
      AND l.tg_user_id IS NOT NULL
    ORDER BY ds.send_at ASC
    LIMIT 100
  `;

  let sent = 0;
  let failed = 0;

  for (const row of pending) {
    const step   = parseInt(row.step, 10);
    const dsType = row.ds_type || 'drip';
    let msgText  = null;
    let markup   = null;

    // ── Определяем текст сообщения по типу ──────────────────────────────
    if (dsType === 'drip') {
      const m = getMessage(step, {
        name          : row.name || '',
        quiz_q5_short : row.quiz_answers?.q5 || '',
      });
      if (m) { msgText = m.text; markup = m.reply_markup; }

    } else if (dsType === 'call_reminder') {
      // Текст берём из events (сохранили при создании)
      const payload = row.reminder_payload;
      if (payload) {
        const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
        msgText = parsed.text;
      }

    } else if (dsType === 'call_followup') {
      // Не отправляем если уже paid/lost/converted
      if (['paid', 'converted', 'lost'].includes(row.lead_status)) {
        await sql`UPDATE drip_schedule SET sent_at = NOW() WHERE id = ${row.drip_id}`;
        continue;
      }
      msgText = buildCallFollowup({ name: row.name || '' });
    }

    if (!msgText) {
      await sql`UPDATE drip_schedule SET sent_at = NOW() WHERE id = ${row.drip_id}`;
      continue;
    }

    const result = await tgSend(BOT_TOKEN, row.tg_user_id, msgText, markup);

    if (result?.ok) {
      await sql`UPDATE drip_schedule SET sent_at = NOW() WHERE id = ${row.drip_id}`;
      await sql`
        INSERT INTO events (id, lead_id, type, payload)
        VALUES (${genId('ev')}, ${row.lead_id}, 'message_sent',
                ${JSON.stringify({ step, ds_type: dsType })}::jsonb)
      `;
      sent++;

      // После последнего drip-сообщения (шаг 7) — помечаем лида как cold
      if (dsType === 'drip' && step === 7) {
        await sql`UPDATE leads SET status = 'cold' WHERE id = ${row.lead_id} AND status = 'active'`;
      }
    } else {
      console.error(`Failed to send ${dsType} step ${step} to lead ${row.lead_id}`);
      failed++;
    }
  }

  // Еженедельная сводка Шамилю — по понедельникам в 08:00 UTC (11:00 МСК)
  // Cron запускается в 08:00 и 15:00 UTC — берём утренний запуск понедельника
  const now = new Date();
  if (now.getUTCDay() === 1 && now.getUTCHours() === 8) {
    await sendWeeklySummary(sql, BOT_TOKEN);
  }

  return res.status(200).json({ ok: true, sent, failed, total: pending.length });
}

async function sendWeeklySummary(sql, token) {
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!CHAT_ID) return;

  const [stats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'new')          AS new_leads,
      COUNT(*) FILTER (WHERE status = 'active')        AS active_leads,
      COUNT(*) FILTER (WHERE status = 'engaged')       AS engaged_leads,
      COUNT(*) FILTER (WHERE status = 'converted')     AS converted_leads,
      COUNT(*) FILTER (WHERE status = 'unsubscribed')  AS unsub_leads,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS week_new
    FROM leads
  `;

  const text =
    `📊 <b>Еженедельная сводка воронки</b>\n\n` +
    `За неделю новых лидов: <b>${stats.week_new}</b>\n\n` +
    `Всего в базе:\n` +
    `• Новые (не открыли бот): ${stats.new_leads}\n` +
    `• Активные (в воронке): ${stats.active_leads}\n` +
    `• Заинтересованные: ${stats.engaged_leads}\n` +
    `• Конвертированные: ${stats.converted_leads}\n` +
    `• Отписались: ${stats.unsub_leads}`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
  });
}
