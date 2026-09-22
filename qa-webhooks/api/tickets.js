// Tickets now live in Redis (a list called "tickets"), so they survive
// between requests and cold starts instead of resetting every time.

const { getClient } = require('../lib/redis');

module.exports = async function handler(req, res) {
  const client = await getClient();

  if (req.method === 'GET') {
    const raw = await client.lRange('tickets', 0, -1);
    const tickets = raw.map((item) => JSON.parse(item));
    res.status(200).json({ tickets });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
