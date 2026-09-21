// Receives events from Meta's WhatsApp Cloud API.
// GET  = Meta's one-time verification handshake when you first subscribe
//        this URL as a webhook (required — Meta will not let you save the
//        subscription until this responds correctly).
// POST = an actual incoming message / status update.
//
// Right now POST just logs what arrives — step 1. Next steps we'll add:
// pull out the message text, compare it against the expected scenario,
// and create a ticket if something doesn't match.

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send('Verification failed — check WHATSAPP_VERIFY_TOKEN matches what you entered in Meta.');
    return;
  }

  if (req.method === 'POST') {
    console.log('[whatsapp] full payload:', JSON.stringify(req.body, null, 2));
    // TODO (next step): extract the message text from
    // req.body.entry[0].changes[0].value.messages[0], run it against the
    // expected scenario script, and store a ticket if it fails.
    res.status(200).json({ received: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
