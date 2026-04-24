const GITHUB_REPO = 'vodasolenaya/artofsales-data';
const GITHUB_API  = 'https://api.github.com';

async function ghGet(path, token) {
  const res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/contents/${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'artofsales-bot',
    },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`GitHub ${res.status}`);
  }
  return res.json();
}

function decodeContent(item) {
  try {
    const json = Buffer.from(item.content.replace(/\n/g, ''), 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // Простая защита паролем
  const secret   = process.env.ADMIN_SECRET;
  const provided = req.query.secret || req.headers['x-admin-secret'];
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = process.env.GITHUB_DB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_DB_TOKEN not set' });

  try {
    // Список всех файлов в submissions/
    const dirItems = await ghGet('submissions', token);
    if (!dirItems || !Array.isArray(dirItems)) {
      return res.status(200).json({ total: 0, items: [] });
    }

    // Только .json файлы, сортировка новые первыми
    const files = dirItems
      .filter(f => f.type === 'file' && f.name.endsWith('.json') && f.name !== '.gitkeep')
      .sort((a, b) => b.name.localeCompare(a.name)); // sub_TIMESTAMP — новые сверху

    const total  = files.length;
    const offset = parseInt(req.query.offset || '0', 10);
    const limit  = parseInt(req.query.limit  || '50', 10);
    const page   = files.slice(offset, offset + limit);

    // Параллельно читаем файлы со страницы
    const items = await Promise.all(
      page.map(async (f) => {
        try {
          const data = await ghGet(`submissions/${f.name}`, token);
          return data ? decodeContent(data) : null;
        } catch { return null; }
      })
    );

    return res.status(200).json({
      total,
      offset,
      limit,
      items: items.filter(Boolean),
    });
  } catch (err) {
    console.error('Submissions error:', err);
    return res.status(500).json({ error: 'Internal error', message: err.message });
  }
}
