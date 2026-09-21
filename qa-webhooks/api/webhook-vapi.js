// Receives events from VAPI (set this URL as your Assistant's "Server URL").
// Right now it just logs what arrives and confirms receipt — this is step 1.
// Next steps we'll add: pull out the transcript, compare it against the
// expected scenario, and create a ticket if something doesn't match.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed, expected POST' });
    return;
  }

  // Optional shared-secret check. Set VAPI_WEBHOOK_SECRET in Vercel env vars,
  // and configure the same value as a custom header in your VAPI assistant
  // if you want to lock this endpoint down. Safe to leave unset for now.
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET;
  if (expectedSecret) {
    const gotSecret = req.headers['x-webhook-secret'];
    if (gotSecret !== expectedSecret) {
      res.status(401).json({ error: 'Invalid webhook secret' });
      return;
    }
  }

  const event = req.body;
  console.log('[vapi] event type:', event && event.message && event.message.type);
  console.log('[vapi] full payload:', JSON.stringify(event, null, 2));

  // TODO (next step): extract event.message.transcript / event.message.artifact,
  // run it against the expected scenario script, and store a ticket if it fails.

  res.status(200).json({ received: true });
};
