// Placeholder ticket list. This resets every time the function cold-starts,
// which is expected for now — step 1 is just proving the webhooks are
// reachable. Next step: swap this array for real persistent storage
// (e.g. Vercel KV / Upstash Redis) so tickets survive between requests.

const tickets = [];

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({ tickets, note: 'In-memory placeholder — not persistent yet.' });
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
};
