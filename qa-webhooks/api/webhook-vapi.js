// Receives events from VAPI (set this URL as your Assistant's "Server URL").
// Most events are just logged and ignored — the one we care about is
// "end-of-call-report", which fires once per call with the full transcript.
//
// The transcript is run through analyzeTranscript() (lib/analyze.js). If
// nothing is wrong, no ticket is created. Each issue found becomes its own
// ticket, starting as Unassigned. We also track two simple counters
// (calls tested / calls that came back clean) so the dashboard can show a
// real pass rate, not just a ticket count.

const { getClient } = require('../lib/redis');
const { analyzeTranscript } = require('../lib/analyze');

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
      const issues = analyzeTranscript(message.transcript || '');
      console.log('[vapi] analysis found', issues.length, 'issue(s)');

      await client.incr('stats:callsTotal');

      if (issues.length === 0) {
        await client.incr('stats:callsClean');
        console.log('[vapi] call passed clean — no ticket created');
      } else {
        const scenario = (message.assistant && message.assistant.name) || 'Unknown assistant';
        const baseTime = Date.now();

        for (let i = 0; i < issues.length; i++) {
          const issue = issues[i];
          const id = 'CALL-' + baseTime + '-' + i;
          const ticket = {
            id,
            issue: issue.actual,
            category: issue.category,
            severity: issue.severity,
            scenario,
            round: 'live-test',
            assignee: null,
            status: 'Unassigned',
            retests: 0,
            expected: issue.expected,
            actual: issue.actual,
            transcript: message.transcript || '',
            testerNote: 'Auto-detected from a real VAPI call. Ended reason: ' + message.endedReason,
            devNote: '',
            createdAt: Date.now()
          };
          await client.hSet('tickets:data', id, JSON.stringify(ticket));
          console.log('[vapi] ticket stored:', id, '-', issue.category, issue.severity);
        }
      }
    } catch (err) {
      console.error('[vapi] analysis/storage failed:', err);
    }
  }

  res.status(200).json({ received: true });
};
