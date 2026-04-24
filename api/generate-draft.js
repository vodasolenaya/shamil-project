/**
 * POST /api/generate-draft
 * Генерирует черновик разбора — бесплатно, без внешних API.
 * Использует rule-based движок из lib/draft-generator.js.
 *
 * Body: { secret, lead_id }
 * Возвращает: { ok, draft, typology, case_name }
 */

import { getDb } from '../lib/db.js';
import { generateDraft } from '../lib/draft-generator.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const secret   = process.env.ADMIN_SECRET;
  const body     = req.body || {};
  const provided = body.secret || req.headers['x-admin-secret'];
  if (!secret || provided !== secret) return res.status(401).json({ error: 'Unauthorized' });

  const { lead_id } = body;
  if (!lead_id) return res.status(400).json({ error: 'lead_id required' });

  const sql = getDb();
  const [lead] = await sql`SELECT * FROM leads WHERE id = ${lead_id} LIMIT 1`;
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const { draft, typology, case_name } = generateDraft(lead);

  // Сохраняем черновик в leads
  await sql`
    UPDATE leads SET
      ai_draft  = ${draft},
      typology  = ${typology}
    WHERE id = ${lead_id}
  `;

  return res.status(200).json({ ok: true, draft, typology, case_name });
}
