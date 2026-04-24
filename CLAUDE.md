# CLAUDE.md — Искусство продаж / artofsales.art

> Этот файл Claude читает автоматически при каждом запуске. Здесь — актуальное состояние проекта, правила работы и архитектура. Подробный контекст о Шамиле, ЦА, кейсах и позиционировании — в `PROJECT_CONTEXT.md`.

---

## 1. Что сделано — актуальная воронка (апрель 2026)

```
Трафик → artofsales.art (index.html)
  → Боли / кейсы / доверие
  → Форма → /api/notify.js → GitHub-база + Telegram Шамилю
  → НЕТ цен, НЕТ упоминания созвона до отправки

Трафик → artofsales.art/diagnostic (diagnostic.html)
  → 8 открытых вопросов
  → Lead-форма: имя + Telegram (только)
  → Submit → /api/notify.js → /thanks.html

/thanks.html
  → 990₽ письменный разбор (единственное место с ценой)
  → Кнопка открыть бота @artofsales_shamil_bot
```

**Жёсткие правила воронки:**
- ❌ Никаких цен на `index.html` и `diagnostic.html`
- ❌ Никаких упоминаний созвона как бесплатного лида
- ❌ Никакого выбора формата в диагностике (всегда `format: 'free'`)
- ✅ 990₽ — только на `thanks.html` как апсейл после отправки

---

## 2. Файловая структура

```
/Users/shamil/shamil-project/
├── index.html              # Главный лендинг (светлая тема)
├── diagnostic.html         # Квиз-диагностика (светлая тема)
├── thanks.html             # Страница «Спасибо» — апсейл 990₽
├── admin.html              # Админка с заявками (читает GitHub API)
├── story.html              # История Шамиля
├── shamil-hero.jpg         # Фото героя
├── og-image.png            # OG для index
├── og-diagnostic.png       # OG для diagnostic
├── robots.txt / sitemap.xml
├── vercel.json             # Rewrites: /diagnostic /thanks /admin /story
├── CLAUDE.md               # ← этот файл (читается автоматически)
├── PROJECT_CONTEXT.md      # Расширенный контекст: ЦА, кейсы, бренд
├── TZ_drip_bot.md          # ТЗ: Telegram-бот 7-дневная воронка (следующий этап)
└── api/
    ├── notify.js           # POST — приём заявки → GitHub + Telegram
    ├── submissions.js      # GET  — список заявок для админки
    ├── tg-bot.js           # POST — webhook Telegram-бота (базовый)
    └── tinkoff-webhook.js  # POST — webhook оплаты Tinkoff (не используется)
```

---

## 3. Технический стек

- **HTML/CSS/JS** — никаких фреймворков, только ванильный JS
- **Хостинг:** Vercel (автодеплой при `git push main`)
- **База данных:** GitHub Contents API (репо `vodasolenaya/artofsales-data`, папка `submissions/`)
- **Шрифт:** Inter 400–900, Google Fonts
- **Метрика:** Яндекс.Метрика ID `108665262` — не трогать

**Деплой:**
```bash
git add index.html diagnostic.html  # указывай конкретные файлы, не -A
git commit -m "описание"
git push origin main
```

---

## 4. Дизайн-система

### Цветовая палитра — обе страницы СВЕТЛЫЕ

```css
/* index.html и diagnostic.html — warm light */
:root {
  --bg: #fafaf8;
  --bg2: #f2f1ed;
  --card: #ffffff;
  --card2: #f7f6f3;
  --border: rgba(0,0,0,.08);
  --border2: rgba(0,0,0,.15);
  --gold: #C9A84C;           /* декоративный золотой */
  --gold2: #b8944a;
  --gold-text: #8B6914;      /* читаемый золотой для текста */
  --gold-glow: rgba(201,168,76,.18);
  --gold-faint: rgba(201,168,76,.08);
  --text: #0d0d0d;
  --text2: #333333;
  --text3: #666666;
  --green: #16a34a;
  --r: 14px;
  --r2: 20px;
}
```

**Важно:** `PROJECT_CONTEXT.md` содержит устаревшую тёмную тему — не использовать её значения. Актуальные значения — выше.

### Ключевые размеры
- Мобильный брейкпоинт: `max-width: 680px`
- Мобильный брейкпоинт для format-chooser (удалён): `max-width: 520px`
- Прогресс-бар: `height: 2px`, gold градиент
- Радиус карточек: `--r: 14px`, `--r2: 20px`

### Компоненты
- `.bento-card` — карточки болей со spotlight hover (mousemove → `--mx, --my`)
- `.case-card` — кейсы учеников, hierarchy: result → period → name
- `.testi-card` — отзывы (без `::before` кавычки — удалена)
- `.hero-eyebrow` — бейдж в hero, mobile: `letter-spacing: .5px; font-size: .7rem`
- `.btn-primary` — золотая кнопка с sheen-анимацией
- `.sticky-bar` — появляется при скролле после hero

---

## 5. API / Backend

### `POST /api/notify.js`
Получает заявку с формы:
```
name, telegram, income, sphere, type, website(honeypot),
format, utm_source, utm_medium, utm_campaign,
q1..q20 (ответы диагностики)
```
- Пишет `submissions/<id>.json` в GitHub (репо `vodasolenaya/artofsales-data`)
- Отправляет уведомление в Telegram Шамилю
- Возвращает `{ok: true, saved: bool, id: string}`

**Мёртвый код:** `format === 'paid'` ветка в `notify.js` — никогда не выполняется (всегда `'free'`), оставить как есть.

### `GET /api/submissions.js`
Защищён `?secret=ADMIN_SECRET`. Читает список из GitHub, пагинация offset/limit.

### `POST /api/tg-bot.js`
Базовый webhook. При `/start` — шлёт приветствие. При других сообщениях — редирект к @vodasolenaya.

---

## 6. Переменные окружения (Vercel)

```
GITHUB_DB_TOKEN      — PAT для записи в artofsales-data
TELEGRAM_BOT_TOKEN   — токен @artofsales_shamil_bot
TELEGRAM_CHAT_ID     — ID Шамиля (куда приходят заявки)
ADMIN_SECRET         — пароль для /admin
```

---

## 7. Правила работы Claude в этом проекте

### Перед правкой файла
1. **Прочитай весь редактируемый блок** ± 30 строк контекста вокруг
2. Если убираешь HTML-компонент → сразу найди и удали его CSS (grep по классам)
3. Если убираешь JS-функцию → убери все её вызовы

### Чеклист после каждого изменения
- [ ] Все HTML-теги закрыты корректно?
- [ ] Убранный HTML → убрать связанный CSS?
- [ ] Текст не противоречит другим местам на странице?
- [ ] Воронка сохраняет правила (п.1)?
- [ ] Мобильная версия учтена (680px)?

### Git-дисциплина
- Коммитить после каждой логической задачи, не накапливать
- Указывать конкретные файлы: `git add index.html`, не `git add -A`
- После push проверять деплой на Vercel

### Чего не делать
- ❌ Не добавлять фреймворки и библиотеки
- ❌ Не трогать Яндекс.Метрика код
- ❌ Не менять структуру воронки без обсуждения
- ❌ Не использовать тёмные CSS-значения из `PROJECT_CONTEXT.md` (устарело)
- ❌ Не использовать em-дашы (—) в кнопках и заголовках

---

## 8. Следующий этап разработки — Telegram-бот воронка

**Файл ТЗ:** `TZ_drip_bot.md`

**Суть:** 7-дневная автоматическая цепочка сообщений в `@artofsales_shamil_bot` для подогрева лидов после диагностики.

**Что нужно построить:**
1. `POST /api/submit-diagnostic` — принимает заявку, пишет в БД, возвращает deeplink на бота
2. БД: Postgres (Neon/Supabase) — таблицы `leads`, `drip_schedule`, `events`
3. Webhook бота `/api/telegram/webhook` — обработка `/start <lead_id>`, ответов пользователя
4. Vercel Cron — раз в час проверяет `drip_schedule`, отправляет нужные сообщения
5. Обновить `thanks.html` — добавить CTA «Открыть бота» с deeplink
6. Обновить `admin.html` — список лидов, статусы, управление воронкой
7. Файл `messages.js` — 8 текстов сообщений (#0..#7) из ТЗ

**Стек бота:** Node.js + нативный fetch (без Telegraf — проще деплоить на Vercel Functions)

**Переменные оффера (редактируемые в админке):**
```
next_cohort_date, slots_left, max_students
```

**Статусы лида:** `new` → `active` → `engaged` → `converted` / `unsubscribed`

Перед стартом реализации — прочитать `TZ_drip_bot.md` целиком.
