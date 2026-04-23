// Telegram bot webhook — auto-reply when user sends /start
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Always respond 200 fast so Telegram doesn't retry
  res.status(200).end();

  const update   = req.body;
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) return;

  const msg = update?.message;
  if (!msg) return;

  const chatId = msg.chat.id;
  const text   = msg.text || '';

  let reply;

  if (text.startsWith('/start')) {
    reply =
      `✅ <b>Шамиль получил твои ответы!</b>\n\n` +
      `Он лично прочитает их и напишет тебе здесь в течение 1–2 часов.\n\n` +
      `Пока ждёшь — посмотри кейсы учеников:\n` +
      `📌 @ozareniecases — реальные результаты\n` +
      `📌 @localframe — основной канал Шамиля\n\n` +
      `Держи телефон рядом 👋`;
  } else {
    // Любое другое сообщение — направляем к Шамилю
    reply =
      `Привет! 👋 Это автоматический бот — я не читаю сообщения здесь.\n\n` +
      `Напиши Шамилю напрямую: <a href="https://t.me/vodasolenaya">@vodasolenaya</a>\n` +
      `Он ответит в течение нескольких часов.`;
  }

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      chat_id:               chatId,
      text:                  reply,
      parse_mode:            'HTML',
      disable_web_page_preview: true,
    }),
  }).catch(console.error);
}
