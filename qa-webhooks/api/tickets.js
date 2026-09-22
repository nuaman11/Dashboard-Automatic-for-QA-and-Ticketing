// Tickets are stored in a Redis HASH ("tickets:data"), keyed by ticket id,
// so individual tickets can be updated in place (for Assign / status
// changes). Two simple counters (stats:callsTotal, stats:callsClean) track
// how many calls have been tested overall, separate from the ticket count,
// so the dashboard can show a real pass rate.

const { getClient } = require('../lib/redis');

module.exports = async function handler(req, res) {
  const client = await getClient();

  if (req.method === 'GET') {
    const raw = await client.hGetAll('tickets:data');
    const tickets = Object.values(raw)
      .map((item) => JSON.parse(item))
      .sort((a, b) => b.createdAt - a.createdAt);

    const [callsTotal, callsClean] = await Promise.all([
      client.get('stats:callsTotal'),
      client.get('stats:callsClean')
    ]);

    res.status(200).json({
      tickets,
      stats: {
        callsTotal: Number(callsTotal) || 0,
        callsClean: Number(callsClean) || 0
      }
    });
    return;
  }

  if (req.method === 'PATCH') {
    const { id, assignee, status } = req.body || {};
    if (!id) {
      res.status(400).json({ error: 'Missing ticket id' });
      return;
    }

    const raw = await client.hGet('tickets:data', id);
    if (!raw) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const ticket = JSON.parse(raw);
    if (assignee !== undefined) ticket.assignee = assignee;
    if (status !== undefined) ticket.status = status;

    await client.hSet('tickets:data', id, JSON.stringify(ticket));
    res.status(200).json({ ticket });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
