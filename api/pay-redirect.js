/**
 * GET /api/pay-redirect?product=tripwire&lead_id=xxx
 *
 * Универсальный редирект на Tinkoff оплату.
 * Используется в кнопках Telegram inline keyboard — клик → сразу на страницу оплаты.
 *
 * Продукты:
 *   breakdown  — 990₽  Письменный разбор продаж
 *   tripwire   — 3000₽ 3 урока по продажам
 *   call       — 5000₽ Персональный созвон
 */

import crypto from 'crypto';

function buildToken(params, password) {
  const all     = { ...params, Password: password };
  const exclude = new Set(['Token', 'DATA', 'Shops', 'Receipt']);
  const sorted  = Object.keys(all)
    .filter(k => !exclude.has(k))
    .sort()
    .map(k => String(all[k]))
    .join('');
  return crypto.createHash('sha256').update(sorted).digest('hex');
}

const PRODUCTS = {
  breakdown: {
    amount:  99000,
    desc:    'Письменный разбор продаж — artofsales.art',
    receipt: 'Письменный разбор продаж',
  },
  tripwire: {
    amount:  300000,
    desc:    '3 урока по продажам — artofsales.art',
    receipt: '3 урока по продажам',
  },
  call: {
    amount:  500000,
    desc:    'Персональный созвон с Шамилем — artofsales.art',
    receipt: 'Персональный созвон',
  },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { product = 'breakdown', lead_id } = req.query;

  const TERMINAL_KEY = process.env.TINKOFF_TERMINAL_KEY;
  const SECRET       = process.env.TINKOFF_SECRET;

  // Нет ключей Tinkoff — отправляем в TG
  if (!TERMINAL_KEY || !SECRET) {
    return res.redirect(302, 'https://t.me/vodasolenaya');
  }

  const p = PRODUCTS[product] || PRODUCTS.breakdown;

  // OrderId: <lead_id>__<product>__<timestamp>
  const orderId = lead_id
    ? `${lead_id}__${product}__${Date.now()}`
    : `anon__${product}__${Date.now()}`;

  const params = {
    TerminalKey: TERMINAL_KEY,
    Amount:      p.amount,
    OrderId:     orderId,
    Description: p.desc,
    SuccessURL:  `https://artofsales.art/thanks?paid=ok&product=${product}`,
    FailURL:     `https://artofsales.art/thanks?paid=fail`,
  };

  params.Token = buildToken(params, SECRET);

  // Receipt — фискальный чек (54-ФЗ), добавляется после Token
  params.Receipt = {
    Email:    'noreply@artofsales.art',
    Taxation: 'usn_income',
    Items: [{
      Name:          p.receipt,
      Price:         p.amount,
      Quantity:      1,
      Amount:        p.amount,
      Tax:           'none',
      PaymentMethod: 'full_prepayment',
      PaymentObject: 'service',
    }],
  };

  if (lead_id) {
    params.DATA = { LeadId: lead_id, Product: product };
  }

  try {
    const resp = await fetch('https://securepay.tinkoff.ru/v2/Init', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(params),
    });
    const data = await resp.json();

    if (data.Success && data.PaymentURL) {
      return res.redirect(302, data.PaymentURL);
    }

    console.error('pay-redirect Tinkoff error:', data);
    return res.redirect(302, 'https://t.me/vodasolenaya');
  } catch (e) {
    console.error('pay-redirect fetch error:', e.message);
    return res.redirect(302, 'https://t.me/vodasolenaya');
  }
}
