import { neon } from '@neondatabase/serverless';

let _sql;

export function getDb() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    _sql = neon(url);
  }
  return _sql;
}

export function genId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
