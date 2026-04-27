-- Migration v3: prevent duplicate drip messages
-- Запустить в Neon SQL Editor (можно выполнять несколько раз — идемпотентно)

-- 1. Удаляем дубликаты по (lead_id, step, type) — оставляем запись с наименьшим id
DELETE FROM drip_schedule a
USING drip_schedule b
WHERE a.id > b.id
  AND a.lead_id = b.lead_id
  AND a.step    = b.step
  AND COALESCE(a.type, 'drip') = COALESCE(b.type, 'drip');

-- 2. Заполняем NULL значениями по умолчанию (на всякий случай)
UPDATE drip_schedule SET type = 'drip' WHERE type IS NULL;

-- 3. Добавляем UNIQUE constraint, если его ещё нет
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'drip_schedule'::regclass
      AND contype  = 'u'
      AND conkey   IS NOT NULL
  ) THEN
    ALTER TABLE drip_schedule
      ADD CONSTRAINT drip_schedule_unique_step UNIQUE (lead_id, step, type);
  END IF;
END $$;

-- 4. Проверка: эта команда должна вернуть 0 строк
SELECT lead_id, step, type, COUNT(*) AS cnt
FROM drip_schedule
GROUP BY lead_id, step, type
HAVING COUNT(*) > 1;
