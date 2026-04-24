/**
 * POST /api/submit-diagnostic
 * Принимает заявку с diagnostic.html:
 *   name, telegram, income, sphere, utm_*, q1..qN (quiz answers), website (honeypot)
 *
 * Действия:
 *  1. Сохраняет лида в Postgres (leads)
 *  2. Отправляет Telegram-уведомление Шамилю
 *  3. Возвращает { ok, lead_id, bot_deeplink }
 */

import { getDb, genId } from '../lib/db.js';

const BOT_USERNAME = 'artofsales_shamil_bot';

async function sendTg(token, chatId, text, attempt = 1) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.description);
  } catch (e) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
      return sendTg(token, chatId, text, attempt + 1);
    }
    console.error('TG send error:', e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ── Парсим тело ──────────────────────────────────────────────────────────
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
  const website      = p.get('website')      || '';  // honeypot
  const utm_source   = p.get('utm_source')   || '';
  const utm_medium   = p.get('utm_medium')   || '';
  const utm_campaign = p.get('utm_campaign') || '';

  // Honeypot — тихо игнорируем ботов
  if (website) return res.status(200).json({ ok: true });

  // ── Собираем ответы q1..q20 ──────────────────────────────────────────────
  const quizAnswers = {};
  const quizList    = [];
  for (let i = 1; i <= 20; i++) {
    const v = p.get(`q${i}`);
    if (!v || !v.trim()) continue;
    const raw = v.trim();
    const nlIdx = raw.indexOf('\n');
    if (nlIdx !== -1) {
      const header   = raw.slice(0, nlIdx).trim();
      const answer   = raw.slice(nlIdx + 1).trim();
      const question = header.replace(/^\[.*?\]\s*/, '');
      quizAnswers[`q${i}`] = answer;
      quizList.push({ n: i, question, answer });
    } else {
      quizAnswers[`q${i}`] = raw;
      quizList.push({ n: i, question: `Вопрос ${i}`, answer: raw });
    }
  }

  // ── ID лида ──────────────────────────────────────────────────────────────
  const lead_id    = genId('lead');
  const bot_deeplink = `https://t.me/${BOT_USERNAME}?start=${lead_id}`;

  // ── 1. Сохраняем в Postgres ───────────────────────────────────────────────
  let savedToDb = false;
  try {
    const sql = getDb();
    await sql`
      INSERT INTO leads (id, tg_handle, name, quiz_answers, income, utm_source, utm_medium, utm_campaign)
      VALUES (
        ${lead_id}, ${telegram}, ${name}, ${JSON.stringify(quizAnswers)}::jsonb,
        ${income}, ${utm_source}, ${utm_medium}, ${utm_campaign}
      )
    `;
    savedToDb = true;
  } catch (dbErr) {
    console.error('DB save error:', dbErr.message);
  }

  // ── 2. Telegram-уведомление Шамилю ───────────────────────────────────────
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

  if (BOT_TOKEN && CHAT_ID) {
    const utmLine  = [utm_source, utm_medium, utm_campaign].filter(Boolean).join(' / ');
    const dbBadge  = savedToDb ? '\n✅ Сохранён в базу' : '\n⚠️ Только Telegram (ошибка базы)';
    const incLine  = income ? `\n💰 Доход: ${income}` : '';

    const MAX = 3900;
    const header =
      `🔥 <b>Новая заявка с диагностики!</b>\n\n` +
      `👤 ${name}\n` +
      `📱 ${telegram}` +
      `${incLine}` +
      `${utmLine ? `\n📌 UTM: ${utmLine}` : ''}` +
      `${dbBadge}\n` +
      `🤖 Бот: ${bot_deeplink}\n\n` +
      `⚡️ Свяжись пока горячий!`;

    const messages = [];
    let answersBlock = '';
    if (quizList.length > 0) {
      answersBlock = '\n\n' + '─'.repeat(28) + '\n📝 <b>Ответы:</b>\n\n';
      answersBlock += quizList.map(({ n, question, answer }) =>
        `<b>${n}. ${question}</b>\n${answer || '—'}`
      ).join('\n\n');
    }

    if ((header + answersBlock).length <= MAX) {
      messages.push(header + answersBlock);
    } else {
      messages.push(header);
      if (quizList.length > 0) {
        let chunk = '📝 <b>Ответы на диагностику:</b>\n\n';
        for (const { n, question, answer } of quizList) {
          const line = `<b>${n}. ${question}</b>\n${answer || '—'}\n\n`;
          if ((chunk + line).length > MAX) { messages.push(chunk.trim()); chunk = line; }
          else { chunk += line; }
        }
        if (chunk.trim()) messages.push(chunk.trim());
      }
    }

    for (const msg of messages) {
      await sendTg(BOT_TOKEN, CHAT_ID, msg);
    }
  }

  return res.status(200).json({ ok: true, saved: savedToDb, lead_id, bot_deeplink });
}
