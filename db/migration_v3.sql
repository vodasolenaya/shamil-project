-- Migration v3: prevent duplicate drip messages
-- Run in Neon SQL Editor after migration_v2.sql

-- 1. Remove duplicate rows — keep the one with the lowest id per (lead_id, step, type)
DELETE FROM drip_schedule a
USING drip_schedule b
WHERE a.id > b.id
  AND a.lead_id = b.lead_id
  AND a.step = b.step
  AND COALESCE(a.type, 'drip') = COALESCE(b.type, 'drip');

-- 2. Add unique constraint to prevent future duplicates
ALTER TABLE drip_schedule
  ADD CONSTRAINT drip_unique UNIQUE (lead_id, step, type);
