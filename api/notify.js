const GITHUB_REPO = 'vodasolenaya/artofsales-data';
const GITHUB_API  = 'https://api.github.com';

async function saveToGitHub(submission) {
  const token = process.env.GITHUB_DB_TOKEN;
  if (!token) throw new Error('GITHUB_DB_TOKEN not set');

  const path    = `submissions/${submission.id}.json`;
  const content = Buffer.from(JSON.stringify(submission, null, 2)).toString('base64');

  const res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'artofsales-bot',
    },
    body: JSON.stringify({
      message: `submission: ${submission.name} (${submission.telegram})`,
      content,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'GitHub write failed');
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Parse body
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

  // Собираем ответы q1..q20
  const quizAnswers = [];
  for (let i = 1; i <= 20; i++) {
    const v = p.get(`q${i}`);
    if (!v || !v.trim()) continue;
    const raw = v.trim();
    const newlineIdx = raw.indexOf('\n');
    if (newlineIdx !== -1) {
      const header     = raw.slice(0, newlineIdx).trim();
      const answer     = raw.slice(newlineIdx + 1).trim();
      const questionText = header.replace(/^\[.*?\]\s*/, '');
      quizAnswers.push({ n: i, question: questionText, answer });
    } else {
      quizAnswers.push({ n: i, question: `Вопрос ${i}`, answer: raw });
    }
  }

  // ─── ФОРМИРУЕМ ОБЪЕКТ ЗАЯВКИ ───────────────────────────────────────────────
  const submission = {
    id:            `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    created_at:    new Date().toISOString(),
    name,
    telegram,
    income,
    sphere,
    type,
    format,
    utm_source,
    utm_medium,
    utm_campaign,
    answers:       quizAnswers,
  };

  // ─── СОХРАНЯЕМ В GITHUB ────────────────────────────────────────────────────
  let savedToDb = false;
  try {
    await saveToGitHub(submission);
    savedToDb = true;
  } catch (dbErr) {
    console.error('GitHub save error:', dbErr.message);
  }

  // ─── TELEGRAM ──────────────────────────────────────────────────────────────
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

  const isDiag = sphere === 'диагностика' || quizAnswers.length > 0;

  const utmParts = [utm_source, utm_medium, utm_campaign].filter(Boolean);
  const utmLine  = utmParts.length ? `\n📌 UTM: ${utmParts.join(' / ')}` : '';

  let formatLine = '';
  if (format === 'free') formatLine = '\n🎯 Формат: Найти барьер (бесплатно)';
  if (format === 'paid') formatLine = '\n💳 Формат: Убрать барьер (990 ₽)';

  const incomeLine = income  ? `\n💰 Доход: ${income}`  : '';
  const sphereLine = sphere && !isDiag ? `\n🎯 Ниша: ${sphere}` : '';
  const typeLine   = type    ? `\n🏷 Тип: ${type}`      : '';
  const dbBadge    = savedToDb ? '\n✅ Сохранено в базу' : '\n⚠️ Только Telegram (ошибка базы)';

  const source = isDiag
    ? '🧪 <b>Диагностика</b>'
    : '📋 <b>Основной лендинг</b>';

  const header =
    `🔥 <b>Новая заявка!</b>\n` +
    `${source}\n\n` +
    `👤 ${name}\n` +
    `📱 ${telegram}` +
    `${incomeLine}${sphereLine}${typeLine}${formatLine}${utmLine}` +
    `${dbBadge}\n\n` +
    `⚡️ Свяжись пока горячий!`;

  // Блок с ответами
  let answersBlock = '';
  if (quizAnswers.length > 0) {
    answersBlock = '\n\n' + '─'.repeat(30) + '\n📝 <b>Ответы на диагностику:</b>\n\n';
    answersBlock += quizAnswers.map(({ n, question, answer }) =>
      `<b>${n}. ${question}</b>\n${answer || '—'}`
    ).join('\n\n');
  }

  // ─── РАЗБИВКА ДЛИННЫХ СООБЩЕНИЙ (лимит Telegram 4096 символов) ─────────────
  const MAX_LEN = 3900;
  const messages = [];

  if ((header + answersBlock).length <= MAX_LEN) {
    messages.push(header + answersBlock);
  } else {
    messages.push(header);
    if (quizAnswers.length > 0) {
      let chunk = '📝 <b>Ответы на диагностику:</b>\n\n';
      for (const { n, question, answer } of quizAnswers) {
        const line = `<b>${n}. ${question}</b>\n${answer || '—'}\n\n`;
        if ((chunk + line).length > MAX_LEN) {
          messages.push(chunk.trim());
          chunk = line;
        } else {
          chunk += line;
        }
      }
      if (chunk.trim()) messages.push(chunk.trim());
    }
  }

  // ─── ОТПРАВКА С RETRY ──────────────────────────────────────────────────────
  async function sendTg(text, attempt = 1) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.description);
    } catch (e) {
      if (attempt < 3) {
        await new Promise(ok => setTimeout(ok, 1000 * attempt));
        return sendTg(text, attempt + 1);
      }
      console.error('Telegram error after retries:', e.message);
    }
  }

  for (const msg of messages) {
    await sendTg(msg);
  }

  return res.status(200).json({ ok: true, saved: savedToDb, id: submission.id });
}
