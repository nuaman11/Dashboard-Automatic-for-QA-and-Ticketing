// Tickets are stored in a Redis HASH ("tickets:data"), keyed by ticket id.
// A hash lets us update one ticket in place (for Assign / status changes)
// without having to rewrite the whole list, which a plain Redis list
// (what we used before) doesn't support cleanly.

const { getClient } = require('../lib/redis');

module.exports = async function handler(req, res) {
  const client = await getClient();

  if (req.method === 'GET') {
    const raw = await client.hGetAll('tickets:data');
    const tickets = Object.values(raw)
      .map((item) => JSON.parse(item))
      .sort((a, b) => b.createdAt - a.createdAt);
    res.status(200).json({ tickets });
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
