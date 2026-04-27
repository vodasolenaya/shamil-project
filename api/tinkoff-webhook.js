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

  // Извлекаем lead_id из OrderId (формат: "<lead_id>__<timestamp>")
  const lead_id = (body.OrderId || '').split('__')[0] || null;

  // ── Обновляем лида в БД ──────────────────────────────────────────────────
  let leadName = '';
  if (lead_id && process.env.DATABASE_URL) {
    try {
      const sql = getDb();
      const rows = await sql`
        UPDATE leads SET status = 'paid', format = 'paid', updated_at = NOW()
        WHERE id = ${lead_id}
        RETURNING name, tg_handle
      `;
      if (rows[0]) {
        leadName = rows[0].name || '';
        const tgUserId = rows[0].tg_user_id;

        // Логируем событие
        await sql`
          INSERT INTO events (id, lead_id, type, payload)
          VALUES (
            ${genId('ev')},
            ${lead_id},
            'paid',
            ${JSON.stringify({ amount: body.Amount, order_id: body.OrderId })}::jsonb
          )
        `.catch(console.error);

        // Планируем питч когорты через 48 часов (если лид открыл бота)
        if (tgUserId) {
          const pitchAt = new Date(Date.now() + 48 * 3600 * 1000);
          await sql`
            INSERT INTO drip_schedule (id, lead_id, step, send_at, message_key, type)
            VALUES (${genId('drip')}, ${lead_id}, 0, ${pitchAt.toISOString()}, 'cohort_pitch', 'cohort_pitch')
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
    const leadLine = leadName
      ? `👤 Клиент: <b>${leadName}</b>${lead_id ? ` · <code>${lead_id}</code>` : ''}`
      : `🔑 OrderId: <code>${body.OrderId || '—'}</code>`;

    const text =
      `💳 <b>Оплата получена — 990 ₽!</b>\n\n` +
      `${leadLine}\n` +
      `Сумма: <b>${amount} ₽</b>\n\n` +
      `Открой админку → найди лид → напиши разбор ✍️\n` +
      `<a href="https://artofsales.art/admin">artofsales.art/admin</a>`;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
    }).catch(console.error);
  }
}
