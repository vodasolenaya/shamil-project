-- Искусство продаж — Telegram drip bot schema
-- Запустить один раз в консоли Neon (SQL Editor)

CREATE TABLE IF NOT EXISTS leads (
  id            TEXT PRIMARY KEY,
  tg_user_id    BIGINT,
  tg_handle     TEXT,
  name          TEXT,
  quiz_answers  JSONB,
  source        TEXT DEFAULT 'diagnostic',
  status        TEXT DEFAULT 'new',   -- new | active | engaged | converted | unsubscribed
  income        TEXT,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  converted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS drip_schedule (
  id           TEXT PRIMARY KEY,
  lead_id      TEXT REFERENCES leads(id) ON DELETE CASCADE,
  step         INTEGER,              -- 0..7
  send_at      TIMESTAMPTZ,         -- время отправки UTC
  sent_at      TIMESTAMPTZ,         -- NULL = не отправлено
  paused       BOOLEAN DEFAULT FALSE,
  message_key  TEXT                 -- "msg_0" .. "msg_7"
);

CREATE TABLE IF NOT EXISTS events (
  id         TEXT PRIMARY KEY,
  lead_id    TEXT REFERENCES leads(id) ON DELETE CASCADE,
  type       TEXT,                  -- message_sent | user_replied | paused | unsubscribed
  payload    JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для быстрых запросов крона
CREATE INDEX IF NOT EXISTS idx_drip_pending
  ON drip_schedule(send_at)
  WHERE sent_at IS NULL AND paused = FALSE;

CREATE INDEX IF NOT EXISTS idx_leads_tg_user
  ON leads(tg_user_id);
