export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Parse body — Vercel may pass parsed object or raw Buffer/string
  const b = req.body;
  let p;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) {
    p = { get: (k) => b[k] ?? null };
  } else {
    const raw = Buffer.isBuffer(b) ? b.toString() : (typeof b === 'string' ? b : '');
    const sp = new URLSearchParams(raw);
    p = { get: (k) => sp.get(k) };
  }

  const name         = p.get('name')         || 'Не указано';
  const telegram     = p.get('telegram')     || 'Не указано';
  const income       = p.get('income')       || '';
  const sphere       = p.get('sphere')       || '';
  const type         = p.get('type')         || '';
  const website      = p.get('website')      || '';
  const format       = p.get('format')       || '';
  const utm_source   = p.get('utm_source')   || '';
  const utm_medium   = p.get('utm_medium')   || '';
  const utm_campaign = p.get('utm_campaign') || '';

  // Honeypot
  if (website) return res.status(200).json({ ok: true });

  // Собираем все ответы q1..q20
  // Формат каждого: "[Блок] Текст вопроса\nОтвет пользователя"
  const quizAnswers = [];
  for (let i = 1; i <= 20; i++) {
    const v = p.get(`q${i}`);
    if (!v || !v.trim()) continue;

    const raw = v.trim();
    const newlineIdx = raw.indexOf('\n');

    if (newlineIdx !== -1) {
      // Разделяем заголовок вопроса и ответ
      const header = raw.slice(0, newlineIdx).trim();
      const answer = raw.slice(newlineIdx + 1).trim();
      // Убираем "[Блок X] " из заголовка если есть
      const questionText = header.replace(/^\[.*?\]\s*/, '');
      quizAnswers.push({ n: i, question: questionText, answer });
    } else {
      quizAnswers.push({ n: i, question: `Вопрос ${i}`, answer: raw });
    }
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

  const isDiag = sphere === 'диагностика' || quizAnswers.length > 0;

  const utmParts = [utm_source, utm_medium, utm_campaign].filter(Boolean);
  const utmLine  = utmParts.length ? `\n📌 UTM: ${utmParts.join(' / ')}` : '';

  let formatLine = '';
  if (format === 'free') formatLine = '\n🎯 Формат: Найти барьер (бесплатно)';
  if (format === 'paid') formatLine = '\n💳 Формат: Убрать барьер (990 ₽)';

  // Блок с ответами — чисто: вопрос жирным, ответ под ним
  let answersBlock = '';
  if (quizAnswers.length > 0) {
    answersBlock = '\n\n' + '─'.repeat(30) + '\n📝 <b>Ответы на диагностику:</b>\n\n';
    answersBlock += quizAnswers.map(({ n, question, answer }) =>
      `<b>${n}. ${question}</b>\n${answer || '—'}`
    ).join('\n\n');
  }

  const incomeLine = income ? `\n💰 Доход: ${income}` : '';
  const sphereLine = sphere && !isDiag ? `\n🎯 Ниша: ${sphere}` : '';
  const typeLine   = type   ? `\n🏷 Тип: ${type}`    : '';

  const source = isDiag
    ? '🧪 <b>Диагностика</b>'
    : '📋 <b>Основной лендинг</b>';

  const text =
    `🔥 <b>Новая заявка!</b>\n` +
    `${source}\n\n` +
    `👤 ${name}\n` +
    `📱 ${telegram}` +
    `${incomeLine}` +
    `${sphereLine}` +
    `${typeLine}` +
    `${formatLine}` +
    `${utmLine}` +
    `${answersBlock}\n\n` +
    `⚡️ Свяжись пока горячий!`;

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
    });
  } catch (e) {
    console.error('Telegram error:', e);
  }

  return res.status(200).json({ ok: true });
}
