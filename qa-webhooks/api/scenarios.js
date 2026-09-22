// Stores the uploaded QA checklist (scenarios parsed from a CSV/paste on
// the dashboard) as a single JSON array in Redis. The checklist is
// wholesale-replaced on each upload, which matches how it's actually
// used — you upload the latest sheet, not add to it row by row.

const { getClient } = require('../lib/redis');

module.exports = async function handler(req, res) {
  const client = await getClient();

  if (req.method === 'GET') {
    const raw = await client.get('scenarios:list');
    const scenarios = raw ? JSON.parse(raw) : [];
    res.status(200).json({ scenarios });
    return;
  }

  if (req.method === 'POST') {
    const { scenarios } = req.body || {};
    if (!Array.isArray(scenarios)) {
      res.status(400).json({ error: 'Expected a JSON body like { "scenarios": [...] }' });
      return;
    }
    await client.set('scenarios:list', JSON.stringify(scenarios));
    res.status(200).json({ saved: scenarios.length });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
