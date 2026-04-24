/**
 * POST /api/generate-analysis
 * Генерирует AI-черновик разбора диагностики через Claude API.
 * Вызывается из админки. Шамиль редактирует перед отправкой.
 *
 * Body: { secret, lead_id, format: 'free' | 'paid' }
 */

import { getDb } from '../lib/db.js';

const SYSTEM_PROMPT = `Ты помогаешь Шамилю Мухаметзянову делать черновик разбора диагностики.
Ты НЕ общаешься с клиентом напрямую — ты пишешь черновик для Шамиля, который он потом редактирует перед отправкой.

СТИЛЬ:
- Прямой, личный, без инфобизнесовых слов («результат», «трансформация», «прорыв», «результативность», «масштабирование»)
- Без emoji в основном тексте разбора (допустимо только в обращении)
- Короткие абзацы (1-3 предложения)
- Конкретные наблюдения вместо абстракций: если пишешь «страх цены» — сразу цитируй ответ клиента, в котором этот страх виден
- Тон: как старший товарищ за столом, не как коуч на сцене
- Запрещено: «инвестируй в себя», «выйди из зоны комфорта», «прокачайся»

ЖЁСТКИЕ ПРАВИЛА:
1. НИКОГДА не придумывай имена учеников. Используй ТОЛЬКО этих:
   - Олег · Digital-агентство / B2B — 420 000 ₽ за 11 дней
   - Марат · Дизайнер, основатель студии — 600 000 ₽, запустил обучение, нанял людей
   - Фёдор · Веб-разработчик, Новосибирск — 300 000+ ₽, пробил потолок
   - Самат · Таргетолог — 460 000 ₽ в марте
   - Егор · Продажи маркетинговых услуг — 100 000 ₽ с нуля
2. НИКОГДА не придумывай цифры результатов
3. Если в ответах человека нет твёрдых данных для вывода — не делай его. Лучше написать «нужно уточнить на созвоне»
4. Не обещай «x2 к доходу» или конкретные цифры роста
5. Не пиши «я AI», не представляйся — это черновик для Шамиля

ТИПОЛОГИЯ (определи в начале разбора):

Типаж A — «Замороженный в просадке»:
  Маркеры: Q8 — «агрессия / злость / бесит» на возражение клиента; Q7 — тревога после называния цены; Q1 — доход упал
  Рекомендованный кейс: Марат или Фёдор

Типаж B — «Системный с гиперответственностью»:
  Маркеры: Q4-Q5 — зрелое описание продукта; Q8 — «надо улучшить себя»; Q14-Q15 — «не заслужил», «ленивый»
  Рекомендованный кейс: Олег

Типаж C — «Готовый без системы»:
  Маркеры: ответы взрослые, но Q6/Q15 — нет системы/плана; Q4-Q5 — продукт есть, ICP размытый
  Рекомендованный кейс: Самат

Если не определяется — напиши «нужно уточнить на созвоне».

СТРУКТУРА ЧЕРНОВИКА (FREE, 500-700 слов):
1. Обращение по имени + 1 предложение что зацепило в ответах
2. Типаж + 2-3 предложения почему, с цитатами из его ответов
3. 3 маркера: цитата → что я здесь вижу (2-3 предложения на каждый)
4. 1 кейс из списка выше (рекомендованный для типажа), 2-3 предложения
5. 1 конкретный шаг на неделю
6. CTA на созвон без давления: «Если откликнулось — давай созвонимся 30 минут, посмотрим конкретно»
7. Подпись «— Шамиль»

СТРУКТУРА ЧЕРНОВИКА (PAID, 1800-2400 слов):
То же что FREE, плюс детальный разбор 5-6 зон:
  - Финансы: где застряли деньги
  - Продажи: паттерн работы с клиентами
  - Психология: какой голос внутри мешает
  - Стратегия: есть ли план или хаос
  - Энергия: где утекает
  - Окружение: с кем рядом
В каждой зоне: цитата → что это значит → что конкретно делать.
3 конкретных действия на 7 дней.
В конце: «Шамиль дополнит голосовым на самое важное.»`;

function buildUserPrompt(lead, format) {
  const qa = lead.quiz_answers || {};
  const lines = [
    `Имя: ${lead.name || 'не указано'}`,
    `Handle: ${lead.tg_handle || 'не указан'}`,
    `Формат черновика: ${format}`,
    '',
    'Ответы на диагностику:',
  ];

  // Добавляем все ответы которые есть
  const labels = {
    q1:  'Сколько зарабатываешь сейчас',
    q2:  'Сколько хочешь зарабатывать',
    q3:  'Что делал для роста',
    q4:  'Что даёшь клиентам',
    q5:  'Кому это нужно / что тебя тормозит',
    q6:  'Где обрывается путь к деньгам',
    q7:  'Что чувствуешь называя цену',
    q8:  'Что происходит когда клиент говорит «дорого»',
    q9:  'Как относишься к более успешному коллеге',
    q10: 'Последний раз когда называл цену — как было',
    q11: 'Потерянный клиент — что произошло',
    q12: 'Решения о которых жалеешь',
    q13: 'Люди вокруг — кто они',
    q14: 'Жизнь через год',
    q15: 'Что мешает прямо сейчас',
  };

  for (let i = 1; i <= 15; i++) {
    const key = `q${i}`;
    const label = labels[key] || `Вопрос ${i}`;
    lines.push(`${i}. ${label}: ${qa[key] || '—'}`);
  }

  lines.push('', `Определи типаж, выдай черновик разбора по структуре.`);
  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const secret   = process.env.ADMIN_SECRET;
  const body     = req.body || {};
  const provided = body.secret || req.headers['x-admin-secret'];
  if (!secret || provided !== secret) return res.status(401).json({ error: 'Unauthorized' });

  const { lead_id, format = 'free' } = body;
  if (!lead_id) return res.status(400).json({ error: 'lead_id required' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const sql = getDb();
  const [lead] = await sql`SELECT * FROM leads WHERE id = ${lead_id} LIMIT 1`;
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  // Вызываем Claude API
  let draft = '';
  let typology = 'unknown';
  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 60000);

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type'     : 'application/json',
        'x-api-key'        : ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model      : 'claude-sonnet-4-5',
        max_tokens : format === 'paid' ? 3000 : 1200,
        system     : SYSTEM_PROMPT,
        messages   : [{ role: 'user', content: buildUserPrompt(lead, format) }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Claude API error:', errText);
      return res.status(502).json({ error: 'Claude API error', detail: errText.slice(0, 300) });
    }

    const data = await resp.json();
    draft = data.content?.[0]?.text || '';

    // Пытаемся определить типаж из ответа
    if (draft.includes('Типаж A') || draft.includes('типаж A') || draft.includes('Замороженный')) typology = 'A';
    else if (draft.includes('Типаж B') || draft.includes('типаж B') || draft.includes('Системный')) typology = 'B';
    else if (draft.includes('Типаж C') || draft.includes('типаж C') || draft.includes('Готовый')) typology = 'C';

  } catch (e) {
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'AI timeout (60s). Попробуй ещё раз.' });
    }
    console.error('generate-analysis error:', e.message);
    return res.status(500).json({ error: e.message });
  }

  // Сохраняем черновик в leads
  const aiJson = { typology, format, generated_at: new Date().toISOString(), model: 'claude-sonnet-4-5', text: draft };
  await sql`
    UPDATE leads SET
      ai_draft         = ${draft},
      typology         = ${typology},
      ai_analysis_json = ${JSON.stringify(aiJson)}::jsonb
    WHERE id = ${lead_id}
  `;

  return res.status(200).json({ ok: true, draft, typology });
}
