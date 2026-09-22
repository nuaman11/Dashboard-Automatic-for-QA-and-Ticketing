// Receives events from VAPI (set this URL as your Assistant's "Server URL").
// Most events are just logged and ignored — the one we care about is
// "end-of-call-report", which fires once per call with the full transcript.
//
// Every finished call currently creates ONE placeholder ticket so the
// pipeline (and now the live dashboard) has something real to show. The
// next step is replacing this stub with real logic that compares the
// transcript against the expected scenario script and only creates a
// ticket when something doesn't match.

const { getClient } = require('../lib/redis');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed, expected POST' });
    return;
  }

  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET;
  if (expectedSecret) {
    const gotSecret = req.headers['x-webhook-secret'];
    if (gotSecret !== expectedSecret) {
      res.status(401).json({ error: 'Invalid webhook secret' });
      return;
    }
  }

  const event = req.body;
  const message = event && event.message;
  console.log('[vapi] event type:', message && message.type);

  if (message && message.type === 'end-of-call-report') {
    try {
      const client = await getClient();

      const id = 'CALL-' + Date.now();
      const ticket = {
        id,
        issue: 'New test call recorded — needs manual review',
        category: 'Uncategorized',
        severity: 'Minor',
        scenario: (message.assistant && message.assistant.name) || 'Unknown assistant',
        round: 'live-test',
        assignee: null,
        status: 'Unassigned',
        retests: 0,
        expected: 'Not yet analyzed — this is a placeholder ticket.',
        actual: 'Not yet analyzed — this is a placeholder ticket.',
        transcript: message.transcript || '',
        testerNote: 'Auto-logged from a real VAPI call. Ended reason: ' + message.endedReason,
        devNote: '',
        createdAt: Date.now()
      };

      await client.hSet('tickets:data', id, JSON.stringify(ticket));
      console.log('[vapi] ticket stored:', id);
    } catch (err) {
      console.error('[vapi] failed to store ticket:', err);
    }
  }

  res.status(200).json({ received: true });
};
