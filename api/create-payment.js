import crypto from 'crypto';

function buildToken(params, password) {
  // Tinkoff token: sort keys A-Z (except Token/DATA/Shops/Receipt),
  // concat values (including Password), SHA-256
  const all = { ...params, Password: password };
  const exclude = new Set(['Token', 'DATA', 'Shops', 'Receipt']);
  const sorted = Object.keys(all)
    .filter(k => !exclude.has(k))
    .sort()
    .map(k => String(all[k]))
    .join('');
  return crypto.createHash('sha256').update(sorted).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const b = req.body;
  let name, telegram, email;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) {
    ({ name, telegram, email } = b);
  } else {
    const raw = Buffer.isBuffer(b) ? b.toString() : (typeof b === 'string' ? b : '');
    const p = new URLSearchParams(raw);
    name     = p.get('name');
    telegram = p.get('telegram');
    email    = p.get('email');
  }

  const TERMINAL_KEY = process.env.TINKOFF_TERMINAL_KEY;
  const SECRET       = process.env.TINKOFF_SECRET;

  if (!TERMINAL_KEY || !SECRET) {
    // Fallback: redirect to Telegram
    return res.status(200).json({ fallback: true });
  }

  const orderId = `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Нормализуем email или используем заглушку для чека
  const emailNorm = (email || '');
  const emailFinal = emailNorm.includes('@') ? emailNorm : 'noreply@artofsales.art';

  const params = {
    TerminalKey:  TERMINAL_KEY,
    Amount:       99000, // 990 ₽ в копейках
    OrderId:      orderId,
    Description:  'Письменный разбор продаж — artofsales.art',
    CustomerKey:  (telegram || 'anon').replace(/[^a-zA-Z0-9_@]/g, '').slice(0, 36),
    SuccessURL:   'https://artofsales.art/diagnostic?paid=ok',
    FailURL:      'https://artofsales.art/diagnostic?paid=fail',
  };

  params.Token = buildToken(params, SECRET);

  // Receipt — фискальный чек (54-ФЗ), добавляется ПОСЛЕ токена
  params.Receipt = {
    Email:    emailFinal,
    Taxation: 'usn_income', // УСН «Доходы»
    Items: [
      {
        Name:          'Письменный разбор продаж',
        Price:         99000,   // в копейках
        Quantity:      1,
        Amount:        99000,   // в копейках
        Tax:           'none',  // без НДС (УСН)
        PaymentMethod: 'full_prepayment',
        PaymentObject: 'service',
      },
    ],
  };

  // DATA добавляется ПОСЛЕ токена (исключена из подписи)
  params.DATA = { Name: name || '', Telegram: telegram || '' };

  try {
    const resp = await fetch('https://securepay.tinkoff.ru/v2/Init', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(params),
    });
    const data = await resp.json();

    if (data.Success && data.PaymentURL) {
      return res.status(200).json({ url: data.PaymentURL, orderId });
    }
    console.error('Tinkoff Init error:', data);
    return res.status(200).json({ fallback: true, message: data.Message });
  } catch (e) {
    console.error('create-payment fetch error:', e);
    return res.status(200).json({ fallback: true });
  }
}
