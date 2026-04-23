# Graph Report - .  (2026-04-20)

## Corpus Check
- Corpus is ~40,387 words - fits in a single context window. You may not need a graph.

## Summary
- 111 nodes · 147 edges · 11 communities detected
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Кейсы и результаты учеников|Кейсы и результаты учеников]]
- [[_COMMUNITY_Backend и Telegram-интеграция|Backend и Telegram-интеграция]]
- [[_COMMUNITY_Главная страница  Конверсия|Главная страница / Конверсия]]
- [[_COMMUNITY_Платёжная система Тинькофф|Платёжная система Тинькофф]]
- [[_COMMUNITY_Страница диагностики (контент)|Страница диагностики (контент)]]
- [[_COMMUNITY_Квиз и боли фрилансера|Квиз и боли фрилансера]]
- [[_COMMUNITY_Форма и воронка диагностики|Форма и воронка диагностики]]
- [[_COMMUNITY_Типы фрилансеров|Типы фрилансеров]]
- [[_COMMUNITY_Бренд и продукт|Бренд и продукт]]
- [[_COMMUNITY_Netlify-обработчик|Netlify-обработчик]]
- [[_COMMUNITY_Устаревший дубль|Устаревший дубль]]

## God Nodes (most connected - your core abstractions)
1. `index.html — Главная страница «Искусство продаж»` - 22 edges
2. `Diagnostic Page — artofsales.art/diagnostic` - 19 edges
3. `Quiz-секция (diagnostic.html) — 8 открытых вопросов (textarea, localStorage, progress bar)` - 13 edges
4. `handler()` - 9 edges
5. `handler()` - 8 edges
6. `API Notify Handler (Vercel)` - 8 edges
7. `Cases-секция (index.html) — Кейсы учеников (Олег, Марат, Самат, Фёдор, Егор)` - 7 edges
8. `Lead Form (diagnostic.html) — Имя + Telegram, кнопка-submit (зависит от selectedFormat)` - 7 edges
9. `handler()` - 6 edges
10. `Types-секция (diagnostic.html) — 4 типа фрилансера: Невидимка, Хаотик, Замороженный, Готовый к росту` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Lead Form Submission (name, telegram, income, sphere, type, format, utm)` --requests--> `Offer: Free 30-min Sales Review Call`  [INFERRED]
  api/notify.js → og-image.html
- `Seller Type Classifier (Невидимка/Хаотик/Замороженный/Готов к росту)` --is_feature_of--> `Diagnostic Page — artofsales.art/diagnostic`  [INFERRED]
  og-diagnostic.html → api/create-payment.js
- `Diagnostic Page — artofsales.art/diagnostic` --references--> `og-diagnostic.png — OG-превью страницы диагностики`  [EXTRACTED]
  api/create-payment.js → og-diagnostic.png
- `index.html — Главная страница «Искусство продаж»` --references--> `og-image.png — OG-превью главной страницы`  [EXTRACTED]
  index.html → og-image.png
- `OG Image — Diagnostic (Почему доход не растёт?)` --represents--> `Diagnostic Page — artofsales.art/diagnostic`  [EXTRACTED]
  og-diagnostic.html → api/create-payment.js

## Communities

### Community 0 - "Кейсы и результаты учеников"
Cohesion: 0.12
Nodes (17): Целевая аудитория: digital-фрилансеры (SMM, таргет, дизайн, разработка, маркетинг) с доходом 50–150к, Кейс: Егор — 0₽ → 100 000₽ за первый месяц с холодных звонков, Кейс: Фёдор — потолок → 300 000+ ₽, пробил психологический барьер, Кейс: Марат — 280к/мес → 600 000₽, запустил обучение по дизайну, Кейс: Олег — 80к/мес → 420 000₽ продаж за 11 дней, Кейс: Самат — нестабильный доход → 460 000₽ в марте, окупил обучение, Cases-секция (index.html) — Кейсы учеников (Олег, Марат, Самат, Фёдор, Егор), Exit Popup (index.html) — «Подожди — у тебя ещё нет разбора» (exit-intent) (+9 more)

### Community 1 - "Backend и Telegram-интеграция"
Cohesion: 0.19
Nodes (14): Env: TELEGRAM_BOT_TOKEN, Env: TELEGRAM_CHAT_ID, Honeypot Anti-Bot Field (website), Lead Form Submission (name, telegram, income, sphere, type, format, utm), Netlify Notify Handler, API Notify Handler (Vercel), Offer: Paid Written Sales Review (990 RUB), Quiz Answers (q1–q8 open-ended) (+6 more)

### Community 2 - "Главная страница / Конверсия"
Cohesion: 0.16
Nodes (15): Концепция: Обучение продажам для фрилансеров без «впаривания», Ценностное предложение: x2 к доходу за 1 месяц, Primary CTA (index.html) — «Записаться на бесплатный разбор» (Hero → #form), Form Fields (index.html) — Имя, Telegram/телефон, Ниша (8 вариантов), Доход (5 диапазонов), Form-секция (index.html) — Форма записи на бесплатный разбор, Hero-секция (index.html) — «Ты хороший специалист. Просто никто не научил тебя нормально продавать.», Pricing-секция (index.html) — 3 тарифа: Диагностика (0₽), Разбор (0₽), Полная программа (по запросу), Pricing Tier 1 (index.html) — Диагностика продаж: 0₽, 8 вопросов, 5–10 минут (+7 more)

### Community 3 - "Платёжная система Тинькофф"
Cohesion: 0.19
Nodes (11): buildToken() — SHA-256 Tinkoff token builder, buildToken(), handler(), Env: TINKOFF_SECRET, Env: TINKOFF_TERMINAL_KEY, Payment Order (orderId, amount 990 RUB), Tinkoff Securepay Init API, Tinkoff CONFIRMED Payment Event (+3 more)

### Community 4 - "Страница диагностики (контент)"
Cohesion: 0.21
Nodes (13): About-секция (diagnostic.html) — Кто такой Шамиль (цитата о 200+ разборах), FAQ-секция (diagnostic.html) — 14 вопросов (аналог FAQ с index.html), How It Works (diagnostic.html) — 3 шага до ясности (8 вопросов → Шамиль читает → разбор), Pain-секция (diagnostic.html) — 6 болей фрилансера (снижение цены, нет системы, дискомфорт продаж), Reviews-секция (diagnostic.html) — «Что говорят после диагностики» (3 отзыва), Diagnostic Page — artofsales.art/diagnostic, About-секция (index.html) — Биография Шамиля Мухаметзянова, Автор: Шамиль Мухаметзянов — эксперт по продажам для фрилансеров (+5 more)

### Community 5 - "Квиз и боли фрилансера"
Cohesion: 0.15
Nodes (13): Ключевая боль: страх называть высокую цену / синдром самозванца, Hero-секция (diagnostic.html) — «Что держит тебя на текущем доходе? Шамиль разберёт лично.», Quiz Q1 (diagnostic.html) — «Сколько зарабатываешь сейчас и сколько хочешь через 3 месяца?», Quiz Q2 (diagnostic.html) — «Вспомни последний раз, когда клиент не купил. Что произошло?», Quiz Q3 (diagnostic.html) — «Что происходит внутри, когда называешь цену клиенту?», Quiz Q4 (diagnostic.html) — «Как ты сейчас находишь клиентов? Что конкретно делаешь каждую неделю?», Quiz Q5 (diagnostic.html) — «Клиент говорит "я подумаю". Что обычно делаешь дальше?», Quiz Q6 (diagnostic.html) — «Как давно твой доход примерно одинаковый? Что уже пробовал чтобы его поднять?» (+5 more)

### Community 6 - "Форма и воронка диагностики"
Cohesion: 0.2
Nodes (10): API /api/create-payment (diagnostic.html) — POST-эндпоинт для создания платежа Tinkoff (990₽), API /api/notify (diagnostic.html) — POST-эндпоинт для отправки ответов квиза Шамилю, Format Chooser (diagnostic.html) — Бесплатный созвон (0₽) vs Письменный разбор (990₽), Lead Form (diagnostic.html) — Имя + Telegram, кнопка-submit (зависит от selectedFormat), Paid Success Banner (diagnostic.html) — «Оплата прошла!» показывается при ?paid=ok, Result-секция (diagnostic.html) — «Ответы получены», CTA «Написать Шамилю в Telegram», Urgency Badge (diagnostic.html) — «Осталось 3 места на бесплатный созвон на этой неделе», Yandex.Metrika (diagnostic.html) — счётчик 108665262, goal quiz_submit, quiz_q{n}_done, payment_success (+2 more)

### Community 7 - "Типы фрилансеров"
Cohesion: 0.29
Nodes (7): Тип фрилансера: Хаотик — клиенты есть, но нет системы поиска и закрытия сделок, Тип фрилансера: Невидимка — нет позиционирования, неуверенность в цене, Тип фрилансера: Готовый к росту — есть система, упирается в потолок, пора масштабировать, Тип фрилансера: Замороженный — всё знает, но не делает; страх отказа и продаж, Types-секция (diagnostic.html) — 4 типа фрилансера: Невидимка, Хаотик, Замороженный, Готовый к росту, og-diagnostic.png — OG-превью страницы диагностики, OG Diagnostic Visual (og-diagnostic.png) — заголовок «Почему доход не растёт?», 4 типа фрилансера справа, CTA «Пройти диагностику»

### Community 8 - "Бренд и продукт"
Cohesion: 0.4
Nodes (5): Domain: artofsales.art, Offer: Free 30-min Sales Review Call, OG Image — Main Landing (Удвой доход за 1 месяц), Product: Sales Training for Freelancers, Sitemap: artofsales.art/sitemap.xml

### Community 9 - "Netlify-обработчик"
Cohesion: 1.0
Nodes (0): 

### Community 10 - "Устаревший дубль"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **44 isolated node(s):** `Env: TINKOFF_TERMINAL_KEY`, `Honeypot Anti-Bot Field (website)`, `UTM Tracking (source/medium/campaign)`, `Payment Order (orderId, amount 990 RUB)`, `Telegram /start Command Auto-Reply` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Netlify-обработчик`** (2 nodes): `handler()`, `notify.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Устаревший дубль`** (1 nodes): `notify.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Diagnostic Page — artofsales.art/diagnostic` connect `Страница диагностики (контент)` to `Кейсы и результаты учеников`, `Главная страница / Конверсия`, `Платёжная система Тинькофф`, `Квиз и боли фрилансера`, `Форма и воронка диагностики`, `Типы фрилансеров`?**
  _High betweenness centrality (0.652) - this node is a cross-community bridge._
- **Why does `handler()` connect `Платёжная система Тинькофф` to `Backend и Telegram-интеграция`, `Страница диагностики (контент)`?**
  _High betweenness centrality (0.428) - this node is a cross-community bridge._
- **Why does `index.html — Главная страница «Искусство продаж»` connect `Кейсы и результаты учеников` to `Главная страница / Конверсия`, `Страница диагностики (контент)`, `Квиз и боли фрилансера`, `Форма и воронка диагностики`?**
  _High betweenness centrality (0.396) - this node is a cross-community bridge._
- **What connects `Env: TINKOFF_TERMINAL_KEY`, `Honeypot Anti-Bot Field (website)`, `UTM Tracking (source/medium/campaign)` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Кейсы и результаты учеников` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._