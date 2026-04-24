-- Migration v2: add direct-assist, call scheduling, AI analysis fields
-- Run in Neon SQL Editor after initial schema.sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS recommended_case     TEXT,
  ADD COLUMN IF NOT EXISTS call_scheduled_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS call_completed       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS call_zoom_url        TEXT,
  ADD COLUMN IF NOT EXISTS call_note            TEXT,
  ADD COLUMN IF NOT EXISTS ai_draft             TEXT,
  ADD COLUMN IF NOT EXISTS final_answer         TEXT,
  ADD COLUMN IF NOT EXISTS ai_analysis_json     JSONB,
  ADD COLUMN IF NOT EXISTS typology             TEXT,
  ADD COLUMN IF NOT EXISTS voice_file_id        TEXT;

-- Extended statuses:
-- new | active | engaged | reached_out | call_scheduled | call_reschedule_requested
-- | call_done | converted | paid | lost | unsubscribed | cold

-- drip_schedule type column (for call reminders vs regular drip)
ALTER TABLE drip_schedule
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'drip';  -- 'drip' | 'call_reminder' | 'call_followup'

-- Index for call reminders
CREATE INDEX IF NOT EXISTS idx_drip_call_reminders
  ON drip_schedule(lead_id, type)
  WHERE sent_at IS NULL AND paused = FALSE;
