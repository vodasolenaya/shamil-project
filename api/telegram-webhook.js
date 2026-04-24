/**
 * POST /api/telegram-webhook
 * Webhook Telegram-бота @artofsales_shamil_bot
 *
 * Обрабатывает:
 *   /start <lead_id>  — связывает tg_user_id с лидом, создаёт расписание, шлёт msg #0
 *   ключевые слова    — пауза, уведомление Шамилю
 *   стоп-слова        — отписка
 *   прочее            — пауза 24ч, уведомление Шамилю
 */

import { getDb, genId } from '../lib/db.js';
import { getMessage, DRIP_SCHEDULE } from '../lib/messages.js';

const INTERESTED_WORDS = ['да', 'интересно', 'хочу', 'запиши', 'разбор', 'созвон', 'когда', 'сколько', 'цена'];
const STOP_WORDS       = ['стоп', 'не пиши', 'отпишись', 'хватит', 'unsubscribe'];

async function tgSend(token, chatId, text, reply_markup) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (reply_markup) body.reply_markup = reply_markup;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json();
  } catch (e) {
    console.error('tgSend error:', e.message);
  }
}

function calcSendAt(daysOffset, hourUTC) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysOffset);
  d.setUTCHours(hourUTC, 0, 0, 0);
  return d.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).end();
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;  // чат Шамиля
  if (!BOT_TOKEN) return;

  const update = req.body;
  const msg    = update?.message;
  if (!msg) return;

  const chatId    = msg.chat.id;
  const tgUserId  = msg.from?.id;
  const text      = (msg.text || '').trim().toLowerCase();
  const firstName = msg.from?.first_name || '';

  // Если БД не настроена — работаем в режиме без БД (только базовые ответы)
  const hasDb = !!process.env.DATABASE_URL;
  let sql;
  if (hasDb) {
    try { sql = getDb(); } catch(e) { console.error('DB init error:', e.message); }
  }

  // ── /start <lead_id> ─────────────────────────────────────────────────────
  if (text.startsWith('/start')) {
    const parts  = msg.text.trim().split(' ');
    const leadId = parts[1] || '';

    if (leadId && sql) {
      // Пытаемся связать tg_user_id с лидом
      const rows = await sql`
        SELECT * FROM leads WHERE id = ${leadId} LIMIT 1
      `;
      const lead = rows[0];

      if (lead) {
        // Обновляем лида
        await sql`
          UPDATE leads
          SET tg_user_id = ${tgUserId}, status = 'active'
          WHERE id = ${leadId}
        `;

        // Создаём расписание (шаги 1..7)
        for (const { step, daysOffset, hourUTC } of DRIP_SCHEDULE) {
          await sql`
            INSERT INTO drip_schedule (id, lead_id, step, send_at, message_key)
            VALUES (${genId('drip')}, ${leadId}, ${step}, ${calcSendAt(daysOffset, hourUTC)}, ${`msg_${step}`})
            ON CONFLICT DO NOTHING
          `;
        }

        // Логируем событие
        await sql`
          INSERT INTO events (id, lead_id, type, payload)
          VALUES (${genId('ev')}, ${leadId}, 'subscribed', ${JSON.stringify({ tg_user_id: tgUserId })}::jsonb)
        `;

        // Шлём сообщение #0 — сразу
        const q5raw = lead.quiz_answers?.q5 || '';
        const m0    = getMessage(0, { name: lead.name || firstName, quiz_q5_short: q5raw });
        if (m0) await tgSend(BOT_TOKEN, chatId, m0.text, m0.reply_markup);

        // Помечаем шаг 0 как отправленный (он вне расписания)
        await sql`
          INSERT INTO events (id, lead_id, type, payload)
          VALUES (${genId('ev')}, ${leadId}, 'message_sent', ${JSON.stringify({ step: 0 })}::jsonb)
        `;

        return;
      }
    }

    // /start без lead_id или lead не найден — базовое приветствие
    await tgSend(BOT_TOKEN, chatId,
      `✅ <b>Шамиль получил твои ответы!</b>\n\n` +
      `Он лично прочитает их и напишет тебе в течение 1–2 часов.\n\n` +
      `Пока ждёшь — посмотри кейсы учеников:\n` +
      `📌 @ozareniecases — реальные результаты\n\n` +
      `Держи телефон рядом 👋`
    );
    return res.status(200).end();
  }

  // ── Найти лида по tg_user_id ──────────────────────────────────────────────
  let lead = null;
  if (sql) {
    const leads = await sql`
      SELECT * FROM leads WHERE tg_user_id = ${tgUserId} AND status != 'unsubscribed' LIMIT 1
    `;
    lead = leads[0] || null;
  }

  // ── Стоп-слова ───────────────────────────────────────────────────────────
  if (STOP_WORDS.some(w => text.includes(w))) {
    if (lead) {
      await sql`UPDATE leads SET status = 'unsubscribed' WHERE id = ${lead.id}`;
      await sql`UPDATE drip_schedule SET paused = TRUE WHERE lead_id = ${lead.id} AND sent_at IS NULL`;
      await sql`
        INSERT INTO events (id, lead_id, type, payload)
        VALUES (${genId('ev')}, ${lead.id}, 'unsubscribed', ${JSON.stringify({ text: msg.text })}::jsonb)
      `;
    }
    await tgSend(BOT_TOKEN, chatId,
      `Хорошо, больше не буду писать.\n\n` +
      `Если захочешь вернуться — напиши сюда в любой момент.`
    );
    return res.status(200).end();
  }

  // ── Ключевые слова (интерес) ──────────────────────────────────────────────
  if (INTERESTED_WORDS.some(w => text.includes(w))) {
    if (lead) {
      await sql`UPDATE leads SET status = 'engaged' WHERE id = ${lead.id}`;
      await sql`UPDATE drip_schedule SET paused = TRUE WHERE lead_id = ${lead.id} AND sent_at IS NULL`;
      await sql`
        INSERT INTO events (id, lead_id, type, payload)
        VALUES (${genId('ev')}, ${lead.id}, 'user_replied', ${JSON.stringify({ text: msg.text, type: 'interested' })}::jsonb)
      `;
    }

    // Уведомляем Шамиля
    if (CHAT_ID) {
      const leadInfo = lead ? `\n👤 ${lead.name} / ${lead.tg_handle}` : `\n👤 @${msg.from?.username || tgUserId}`;
      await tgSend(BOT_TOKEN, CHAT_ID,
        `🔥 <b>Лид заинтересован!</b>${leadInfo}\n\n` +
        `💬 Написал: «${msg.text}»\n\n` +
        `Воронка на паузе — жди твоего ответа.`
      );
    }

    await tgSend(BOT_TOKEN, chatId,
      `Отлично! Шамиль увидит твоё сообщение и напишет лично.\n\n` +
      `Обычно отвечает в течение нескольких часов.`
    );
    return res.status(200).end();
  }

  // ── Любое другое сообщение ────────────────────────────────────────────────
  if (lead) {
    // Пауза на 24 часа
    const resumeAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await sql`
      UPDATE drip_schedule
      SET paused = TRUE
      WHERE lead_id = ${lead.id} AND sent_at IS NULL
    `;
    await sql`
      INSERT INTO events (id, lead_id, type, payload)
      VALUES (${genId('ev')}, ${lead.id}, 'user_replied', ${JSON.stringify({ text: msg.text, type: 'other', resume_at: resumeAt })}::jsonb)
    `;

    // Уведомляем Шамиля
    if (CHAT_ID) {
      await tgSend(BOT_TOKEN, CHAT_ID,
        `💬 <b>Сообщение от лида</b>\n` +
        `👤 ${lead.name} / ${lead.tg_handle}\n\n` +
        `«${msg.text}»\n\n` +
        `Воронка на паузе 24ч. Если хочешь ответить — напиши ему лично.`
      );
    }
  }

  // Автоответ пользователю
  await tgSend(BOT_TOKEN, chatId,
    `Привет! Это автоматический бот.\n\n` +
    `Шамиль читает твоё сообщение и вернётся лично. Если срочно — напиши напрямую: <a href="https://t.me/vodasolenaya">@vodasolenaya</a>`
  );

  return res.status(200).end();
}
