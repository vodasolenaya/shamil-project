/**
 * GET /api/leads-admin
 * Список лидов из Postgres для админки.
 * Защищён тем же ADMIN_SECRET что и submissions.
 *
 * Query params:
 *   secret     — обязательно
 *   offset     — пагинация (default 0)
 *   limit      — (default 50)
 *   status     — фильтр по статусу
 *   action     — "pause" | "resume" | "convert" (с параметром lead_id)
 *   lead_id    — для action
 */

import { getDb } from '../lib/db.js';

export default async function handler(req, res) {
  const secret   = process.env.ADMIN_SECRET;
  const provided = req.query.secret || req.headers['x-admin-secret'];
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sql = getDb();

  // ── Действия над лидом ────────────────────────────────────────────────────
  const { action, lead_id } = req.query;

  if (action && lead_id) {
    try {
      if (action === 'pause') {
        await sql`UPDATE drip_schedule SET paused = TRUE  WHERE lead_id = ${lead_id} AND sent_at IS NULL`;
        return res.status(200).json({ ok: true });
      }
      if (action === 'resume') {
        await sql`UPDATE drip_schedule SET paused = FALSE WHERE lead_id = ${lead_id} AND sent_at IS NULL`;
        await sql`UPDATE leads SET status = 'active' WHERE id = ${lead_id} AND status = 'engaged'`;
        return res.status(200).json({ ok: true });
      }
      if (action === 'convert') {
        await sql`UPDATE leads SET status = 'converted', converted_at = NOW() WHERE id = ${lead_id}`;
        await sql`UPDATE drip_schedule SET paused = TRUE WHERE lead_id = ${lead_id} AND sent_at IS NULL`;
        return res.status(200).json({ ok: true });
      }
      if (action === 'delete') {
        await sql`DELETE FROM leads WHERE id = ${lead_id}`;
        return res.status(200).json({ ok: true });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Список лидов ──────────────────────────────────────────────────────────
  try {
    const offset    = parseInt(req.query.offset || '0', 10);
    const limit     = parseInt(req.query.limit  || '50', 10);
    const statusFilter = req.query.status;

    const [{ total }] = statusFilter
      ? await sql`SELECT COUNT(*) AS total FROM leads WHERE status = ${statusFilter}`
      : await sql`SELECT COUNT(*) AS total FROM leads`;

    const leads = statusFilter
      ? await sql`
          SELECT l.*,
            (SELECT COUNT(*) FROM drip_schedule ds WHERE ds.lead_id = l.id AND ds.sent_at IS NOT NULL) AS msgs_sent,
            (SELECT MAX(ds.step) FROM drip_schedule ds WHERE ds.lead_id = l.id AND ds.sent_at IS NOT NULL) AS current_step
          FROM leads l WHERE l.status = ${statusFilter}
          ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${offset}
        `
      : await sql`
          SELECT l.*,
            (SELECT COUNT(*) FROM drip_schedule ds WHERE ds.lead_id = l.id AND ds.sent_at IS NOT NULL) AS msgs_sent,
            (SELECT MAX(ds.step) FROM drip_schedule ds WHERE ds.lead_id = l.id AND ds.sent_at IS NOT NULL) AS current_step
          FROM leads l
          ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${offset}
        `;

    return res.status(200).json({ total: Number(total), offset, limit, items: leads });
  } catch (err) {
    console.error('leads-admin error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
