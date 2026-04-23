import crypto from 'crypto';

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

  const body = req.body;
  const SECRET = process.env.TINKOFF_SECRET;

  if (!verifyToken(body, SECRET)) {
    console.warn('Tinkoff webhook: invalid token');
    return res.status(400).send('Invalid token');
  }

  // Tinkoff requires "OK" response regardless
  res.status(200).send('OK');

  if (body.Status === 'CONFIRMED') {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
    const amount    = (Number(body.Amount) / 100).toLocaleString('ru-RU');

    const text =
      `💳 <b>Оплата получена!</b>\n\n` +
      `Сумма: <b>${amount} ₽</b>\n` +
      `Заказ: <code>${body.OrderId}</code>\n\n` +
      `Клиент оплатил письменный разбор.\n` +
      `Найди его анкету выше — и напиши разбор ✍️`;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
    }).catch(console.error);
  }
}
