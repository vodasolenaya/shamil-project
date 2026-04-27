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
    const productLabel = PRODUCT_LABELS[product] || product;
    const leadLine = leadName
      ? `👤 <b>${leadName}</b>${leadHandle ? ` · ${leadHandle}` : ''}${lead_id ? ` · <code>${lead_id}</code>` : ''}`
      : `🔑 OrderId: <code>${body.OrderId || '—'}</code>`;

    const followupLine = product === 'breakdown'
      ? `\n📤 Питч уроков запланирован через 48ч`
      : product === 'tripwire'
      ? `\n📤 Доступ к урокам будет отправлен через 5 мин`
      : '';

    const text =
      `💳 <b>Оплата получена — ${amount} ₽ (${productLabel})!</b>\n\n` +
      `${leadLine}\n` +
      `Сумма: <b>${amount} ₽</b>${followupLine}\n\n` +
      `<a href="https://artofsales.art/admin">Открыть админку →</a>`;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
    }).catch(console.error);
  }
}
