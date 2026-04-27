import crypto from 'crypto';
import { getDb, genId } from '../lib/db.js';

function verifyToken(body, password) {
  const all = { ...body, Password: password };
  const exclude = new Set(['Token', 'DATA', 'Shops', 'Receipt']);
  const sorted = Object.keys(all)
    .filter(k => !exclude.has(k))
    .sort()
    .map(k => String(all[k]))
    .join('');
  const expected = crypto.createHash('sha256').update(sorted).digest('hex');
  return expected === body.Token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body   = req.body;
  const SECRET = process.env.TINKOFF_SECRET;

  if (!SECRET || !verifyToken(body, SECRET)) {
    console.warn('Tinkoff webhook: invalid token');
    return res.status(400).send('Invalid token');
  }

  // Tinkoff requires "OK" response regardless — отвечаем сразу
  res.status(200).send('OK');

  if (body.Status !== 'CONFIRMED') return;

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
  const amount    = (Number(body.Amount) / 100).toLocaleString('ru-RU');

  // Парсим OrderId: <lead_id>__<product>__<timestamp> или <lead_id>__<timestamp> (старый формат)
  const parts   = (body.OrderId || '').split('__');
  const lead_id = parts[0] || null;
  const product = parts.length >= 3 ? parts[1] : 'breakdown'; // default для старых заказов

  const PRODUCT_LABELS = {
    breakdown: 'Письменный разбор',
    tripwire:  '3 урока',
    call:      'Созвон',
  };

  // ── Обновляем лида в БД ──────────────────────────────────────────────────
  let leadName = '';
  let leadHandle = '';
  let tgUserId = null;

  if (lead_id && process.env.DATABASE_URL) {
    try {
      const sql = getDb();

      if (product === 'tripwire') {
        // Трипваер 3 000₽ — ставим format = 'paid_tripwire'
        const rows = await sql`
          UPDATE leads SET status = 'paid', format = 'paid_tripwire', updated_at = NOW()
          WHERE id = ${lead_id}
          RETURNING name, tg_handle, tg_user_id
        `;
        if (rows[0]) {
          leadName   = rows[0].name || '';
          leadHandle = rows[0].tg_handle || '';
          tgUserId   = rows[0].tg_user_id;
        }
      } else if (product === 'call') {
        // Созвон 5 000₽
        const rows = await sql`
          UPDATE leads SET status = 'call_scheduled', format = 'paid_call', updated_at = NOW()
          WHERE id = ${lead_id}
          RETURNING name, tg_handle, tg_user_id
        `;
        if (rows[0]) {
          leadName   = rows[0].name || '';
          leadHandle = rows[0].tg_handle || '';
          tgUserId   = rows[0].tg_user_id;
        }
      } else {
        // Разбор 990₽ (breakdown) — дефолтный флоу
        const rows = await sql`
          UPDATE leads SET status = 'paid', format = 'paid', updated_at = NOW()
          WHERE id = ${lead_id}
          RETURNING name, tg_handle, tg_user_id
        `;
        if (rows[0]) {
          leadName   = rows[0].name || '';
          leadHandle = rows[0].tg_handle || '';
          tgUserId   = rows[0].tg_user_id;
        }
      }

      // Логируем событие
      await sql`
        INSERT INTO events (id, lead_id, type, payload)
        VALUES (
          ${genId('ev')},
          ${lead_id},
          'paid',
          ${JSON.stringify({ amount: body.Amount, order_id: body.OrderId, product })}::jsonb
        )
      `.catch(console.error);

      // ── Планируем автоматические follow-up сообщения ────────────────────
      if (tgUserId) {
        if (product === 'breakdown') {
          // Питч трипваера через 48 часов
          const pitchAt = new Date(Date.now() + 48 * 3600 * 1000);
          await sql`
            INSERT INTO drip_schedule (id, lead_id, step, send_at, message_key, type)
            VALUES (${genId('drip')}, ${lead_id}, 0, ${pitchAt.toISOString()}, 'tripwire_pitch', 'tripwire_pitch')
            ON CONFLICT DO NOTHING
          `.catch(console.error);

        } else if (product === 'tripwire') {
          // Доступ к урокам через 5 минут
          const accessAt = new Date(Date.now() + 5 * 60 * 1000);
          await sql`
            INSERT INTO drip_schedule (id, lead_id, step, send_at, message_key, type)
            VALUES (${genId('drip')}, ${lead_id}, 0, ${accessAt.toISOString()}, 'tripwire_access', 'tripwire_access')
            ON CONFLICT DO NOTHING
          `.catch(console.error);

          // Питч созвона через 3 дня
          const callPitchAt = new Date(Date.now() + 3 * 24 * 3600 * 1000);
          await sql`
            INSERT INTO drip_schedule (id, lead_id, step, send_at, message_key, type)
            VALUES (${genId('drip')}, ${lead_id}, 0, ${callPitchAt.toISOString()}, 'call_pitch', 'call_pitch')
            ON CONFLICT DO NOTHING
          `.catch(console.error);
        }
      }

    } catch (e) {
      console.error('Tinkoff webhook DB error:', e.message);
    }
  }

  // ── Уведомляем Шамиля ─────────────────────────────────────────────────────
  if (BOT_TOKEN && CHAT_ID) {
    const nameStr   = leadName   || 'Неизвестно';
    const handleStr = leadHandle || '—';
    let text;

    if (product === 'tripwire') {
      // Уроки 3 000₽ — максимально чётко для выдачи доступа
      text =
        `💰 <b>ОПЛАТА 3 000₽ — УРОКИ</b>\n\n` +
        `👤 <b>${nameStr}</b>\n` +
        `📱 Telegram: <b>${handleStr}</b>\n` +
        (lead_id ? `🔑 ID: <code>${lead_id}</code>\n` : '') +
        `\n⚡️ <b>НУЖНО ВЫДАТЬ ДОСТУП К УРОКАМ</b>\n\n` +
        `<a href="https://artofsales.art/admin">Открыть в админке →</a>`;
    } else if (product === 'call') {
      text =
        `💰 <b>ОПЛАТА 5 000₽ — СОЗВОН</b>\n\n` +
        `👤 <b>${nameStr}</b>\n` +
        `📱 Telegram: <b>${handleStr}</b>\n` +
        (lead_id ? `🔑 ID: <code>${lead_id}</code>\n` : '') +
        `\n📅 Назначь время <a href="https://artofsales.art/admin">в админке →</a>`;
    } else {
      // Разбор 990₽
      text =
        `💳 <b>Оплата 990₽ — разбор</b>\n\n` +
        `👤 <b>${nameStr}</b> · ${handleStr}\n` +
        `📤 Питч уроков запланирован через 48ч\n\n` +
        `<a href="https://artofsales.art/admin">Открыть админку →</a>`;
    }

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
    }).catch(console.error);

    // Если настроен чат ассистента — дублируем уведомление о выдаче доступа
    const ASSISTANT_CHAT_ID = process.env.ASSISTANT_CHAT_ID;
    if (ASSISTANT_CHAT_ID && product === 'tripwire') {
      const assistantText =
        `⚡️ <b>Выдать доступ к урокам</b>\n\n` +
        `Клиент: <b>${nameStr}</b>\n` +
        `Telegram: <b>${handleStr}</b>\n\n` +
        `Оплатил 3 000₽ только что.`;
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chat_id: ASSISTANT_CHAT_ID, text: assistantText, parse_mode: 'HTML' }),
      }).catch(console.error);
    }
  }
}
