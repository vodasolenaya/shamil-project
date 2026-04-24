# CLAUDE.md — Искусство продаж / artofsales.art

> Этот файл Claude читает автоматически при каждом запуске. Здесь — актуальное состояние проекта, правила работы и архитектура. Расширенный контекст о Шамиле, ЦА, кейсах и позиционировании — в `PROJECT_CONTEXT.md`.

---

## 1. Воронка (апрель 2026 — актуально)

```
Трафик → artofsales.art (index.html)
  → Боли / кейсы / доверие / история
  → Кнопка «Пройти диагностику» → /diagnostic

/diagnostic (diagnostic.html)
  → 8 открытых вопросов + имя + Telegram
  → Submit → /api/submit-diagnostic
       → Neon Postgres (таблица leads)
       → Telegram-уведомление Шамилю
       → deeplink на бота: t.me/artofsales_shamil_bot?start=<lead_id>
  → Редирект на /thanks?id=<lead_id>

/thanks (thanks.html)
  → Подтверждение + апсейл 990 ₽
  → Кнопка «Письменный разбор» → t.me/vodasolenaya (Шамиль вручную)
  → Кнопка «Открыть бота» с deeplink (если есть в sessionStorage)

@artofsales_shamil_bot (webhook: /api/telegram-webhook)
  → /start <lead_id> → привязка, drip-расписание, msg #0
  → Ключевые слова → пауза воронки, уведомление Шамилю
  → Стоп-слова → отписка

Vercel Cron (08:00 и 15:00 UTC)
  → /api/cron-drip → рассылка по расписанию

/admin (admin.html)
  → Заявки из GitHub (старые) + лиды из Neon (новые)
  → Статусы, шаблоны, созвоны, черновики разборов
  → Защита: ADMIN_SECRET в query string
```

**Жёсткие правила воронки:**
- ❌ Никаких цен на `index.html` и `diagnostic.html`
- ❌ Никакого упоминания созвона как бесплатного лида
- ✅ 990 ₽ — только на `thanks.html` как апсейл

---

## 2. Файловая структура

```
/Users/shamil/shamil-project/
├── index.html              # Главный лендинг
├── diagnostic.html         # Диагностика (8 вопросов)
├── thanks.html             # Страница «Спасибо» — апсейл 990₽
├── admin.html              # Админка (GitHub-заявки + Neon-лиды)
├── story.html              # История Шамиля
├── shamil-hero.jpg
├── og-image.png / og-diagnostic.png
├── robots.txt / sitemap.xml
├── vercel.json             # Rewrites: /diagnostic /thanks /admin /story
├── CLAUDE.md               # ← этот файл
├── PROJECT_CONTEXT.md      # ЦА, кейсы, бренд (расширенный контекст)
├── BRIEF_core_offer.md     # Источник правды по позиционированию
│
├── api/
│   ├── notify.js           # POST — старая форма заявки → GitHub + TG (legacy)
│   ├── submissions.js      # GET  — список GitHub-заявок для админки
│   ├── submit-diagnostic.js# POST — новая форма диагностики → Neon + TG
│   ├── leads-admin.js      # GET/POST — работа с лидами из Neon
│   ├── telegram-webhook.js # POST — webhook @artofsales_shamil_bot
│   ├── cron-drip.js        # GET  — Vercel Cron (каждый час)
│   ├── generate-analysis.js# POST — AI-черновик (требует ANTHROPIC_API_KEY — НЕ НАСТРОЕН)
│   ├── tg-bot.js           # POST — старый базовый бот (legacy, не используется)
│   ├── create-payment.js   # POST — Tinkoff (не используется)
│   └── tinkoff-webhook.js  # POST — Tinkoff webhook (не используется)
│
├── lib/
│   ├── db.js               # getDb() → Neon Postgres (@neondatabase/serverless)
│   ├── messages.js         # getMessage(), DRIP_SCHEDULE (8 сообщений #0..#7)
│   ├── message-templates.js# buildTemplates(), buildCallFollowup(), buildCallReminder()
│   └── cases.js            # CASES[], recommendCase(quizAnswers)
│
└── db/
    ├── schema.sql          # Базовая схема
    └── migration_v2.sql    # ALTER TABLE (запустить в Neon SQL Editor вручную)
```

---

## 3. Технический стек

- **Frontend:** HTML/CSS/JS, без фреймворков, ванильный JS
- **Хостинг:** Vercel (автодеплой при `git push main`)
- **БД:** Neon Postgres (`@neondatabase/serverless`) — таблицы: `leads`, `drip_schedule`, `events`
- **Старая БД (legacy):** GitHub Contents API (репо `vodasolenaya/artofsales-data`, папка `submissions/`) — только для старых заявок
- **Шрифт:** Inter 400–900, Google Fonts
- **Метрика:** Яндекс.Метрика ID `108665262` — **не трогать**
- **CI:** GitHub Actions (`.github/workflows/content-guard.yml`) — проверяет запрещённые имена и стоп-слова

**Деплой:**
```bash
git add index.html diagnostic.html  # указывай конкретные файлы, не -A
git commit -m "описание"
git push origin main
```

---

## 4. База данных — Neon Postgres

### Таблицы

**`leads`** — основная таблица лидов:
```
id, name, tg_handle, tg_user_id, email,
income, sphere, quiz_answers (JSONB),
status, format, source,
recommended_case, typology,
ai_draft, final_answer, ai_analysis_json (JSONB),
voice_file_id,
call_scheduled_at, call_completed, call_zoom_url, call_note,
created_at, updated_at
```

**Статусы лида:** `new` → `active` → `engaged` → `reached_out` → `call_scheduled` → `call_done` → `converted` / `paid` / `lost` / `unsubscribed` / `cold`

**`drip_schedule`** — расписание drip-сообщений:
```
id, lead_id, step, send_at, sent_at, paused, message_key, type
```
Типы: `drip` (обычное), `call_reminder`, `call_followup`

**`events`** — лог событий:
```
id, lead_id, type, payload (JSONB), created_at
```

### ⚠️ Миграция
`db/migration_v2.sql` нужно запустить вручную в Neon SQL Editor (один раз).

---

## 5. API endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/submit-diagnostic` | Новая заявка → Neon + TG |
| GET | `/api/submissions` | Старые GitHub-заявки (legacy) |
| GET/POST | `/api/leads-admin` | Управление лидами в Neon |
| POST | `/api/telegram-webhook` | Webhook бота |
| GET | `/api/cron-drip` | Запуск drip (Vercel Cron) |
| POST | `/api/notify` | Старая форма (legacy) |

### `POST /api/leads-admin` — действия:
`pause`, `resume`, `convert`, `paid`, `lost`, `delete`, `send_message`, `schedule_call`, `call_completed`, `cancel_call`, `save_draft`, `save_final`, `send_final`

---

## 6. Переменные окружения (Vercel)

```
# Обязательные для работы бота
TELEGRAM_BOT_TOKEN   — токен @artofsales_shamil_bot
TELEGRAM_CHAT_ID     — ID чата Шамиля (уведомления о лидах)
DATABASE_URL         — Neon Postgres connection string

# Обязательные для админки
ADMIN_SECRET         — пароль для /admin
CRON_SECRET          — токен для /api/cron-drip (Vercel Cron)

# Для старых GitHub-заявок (legacy)
GITHUB_DB_TOKEN      — PAT для записи в artofsales-data

# НЕ настроен (AI-разбор отключён — Шамиль пишет вручную)
# ANTHROPIC_API_KEY
```

---

## 7. Дизайн-система (актуальные значения)

### Цветовая палитра — светлая тема (обе страницы)

```css
:root {
  --bg: #fafaf8;
  --bg2: #f2f1ed;
  --card: #ffffff;
  --card2: #f7f6f3;
  --border: rgba(0,0,0,.08);
  --border2: rgba(0,0,0,.15);
  --gold: #C9A84C;
  --gold2: #b8944a;
  --gold-text: #8B6914;
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

**Важно:** `PROJECT_CONTEXT.md` содержит устаревшую тёмную тему — не использовать. Актуальные значения выше.

### Ключевые размеры
- Мобильный брейкпоинт: `max-width: 680px`
- Радиус карточек: `--r: 14px`, `--r2: 20px`

---

## 8. 5 канонических кейсов учеников

| Имя | Роль | Результат |
|-----|------|-----------|
| Олег | Digital-агентство / B2B | 420 000 ₽ за 11 дней |
| Марат | Дизайнер, основатель студии | 600 000 ₽, запустил обучение |
| Самат | Таргетолог | 460 000 ₽ в марте |
| Фёдор | Веб-разработчик, Новосибирск | 300 000+ ₽, пробил потолок |
| Егор | Продажи маркетинговых услуг | 100 000 ₽ с нуля |

**Запрещённые имена:** Анна, Дмитрий, Артём — **никогда не использовать**

**Стоп-слова:** трансформация, прорыв, масштабирование, инвестируй в себя, выйди из зоны комфорта, прокачайся

---

## 9. Правила работы Claude в этом проекте

### Перед правкой файла
1. Прочитай весь редактируемый блок ± 30 строк контекста вокруг
2. Если убираешь HTML-компонент → сразу найди и удали его CSS (grep по классам)
3. Если убираешь JS-функцию → убери все её вызовы

### Чеклист после изменения
- [ ] Все HTML-теги закрыты корректно?
- [ ] Убранный HTML → убрать связанный CSS?
- [ ] Текст не противоречит другим местам на странице?
- [ ] Воронка сохраняет правила из п.1?
- [ ] Мобильная версия учтена (680px)?

### Git-дисциплина
- Коммитить после каждой логической задачи
- Указывать конкретные файлы: `git add index.html`, не `git add -A`
- После push проверять деплой на Vercel

### Чего не делать
- ❌ Не добавлять фреймворки и библиотеки
- ❌ Не трогать Яндекс.Метрика код (ID 108665262)
- ❌ Не менять структуру воронки без обсуждения
- ❌ Не использовать тёмные CSS-значения из `PROJECT_CONTEXT.md` (устарело)
- ❌ Не использовать em-дашы (—) в кнопках и заголовках

---

## 10. GitHub Actions — Content Guard

Файл: `.github/workflows/content-guard.yml`

Запускается при push/PR к `**.html` и `lib/messages.js`:
- ❌ **Блокирует** если найдены запрещённые имена (Анна, Дмитрий, Артём)
- ⚠️ **Предупреждает** (не блокирует) при стоп-словах
- ⚠️ **Предупреждает** если Самат не Веб-разработчик
- ⚠️ **Предупреждает** при `href="#"` (заглушки)
