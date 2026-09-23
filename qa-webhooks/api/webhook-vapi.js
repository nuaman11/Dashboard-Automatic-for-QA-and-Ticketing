// Receives events from VAPI (set this URL as your Assistant's "Server URL").
// Most events are just logged and ignored — the one we care about is
// "end-of-call-report", which fires once per call with the full transcript.
//
// Analysis now works two ways:
//   1. If a QA checklist has been uploaded AND ANTHROPIC_API_KEY is set,
//      Claude compares the transcript against each checklist row.
//   2. Otherwise, falls back to the fixed regex rules in lib/analyze.js.
// Either way, a clean call creates zero tickets; each real issue found
// becomes its own ticket, starting as Unassigned.

const { getClient } = require('../lib/redis');
const { analyzeTranscript } = require('../lib/analyze');
const { analyzeWithChecklist } = require('../lib/llmAnalyze');

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
      const transcript = message.transcript || '';

      const rawChecklist = await client.get('scenarios:list');
      const checklist = rawChecklist ? JSON.parse(rawChecklist) : [];

      let issues = [];
      let usedChecklist = false;

      if (checklist.length > 0) {
        try {
          const results = await analyzeWithChecklist(transcript, checklist);
          usedChecklist = true;
          issues = (results || [])
            .filter((r) => r.tested && r.passed === false)
            .map((r) => {
              const row = checklist.find((c) => c.id === r.id);
              return {
                expected: row ? row.agentShould : '(checklist item ' + r.id + ')',
                actual: r.actual || 'Did not meet the checklist expectation.',
                severity: r.severity || 'Major',
                category: r.category || 'Prompt'
              };
            });
        } catch (llmErr) {
          console.error('[vapi] checklist/LLM analysis failed, falling back to regex rules:', llmErr.message);
          issues = analyzeTranscript(transcript);
          usedChecklist = false;
        }
      } else {
        issues = analyzeTranscript(transcript);
      }

      console.log('[vapi] analysis (' + (usedChecklist ? 'checklist via Gemini' : 'built-in regex rules') + ') found', issues.length, 'issue(s)');

      await client.incr('stats:callsTotal');

      if (usedChecklist) {
        await client.incr('stats:checklistRounds');
      }

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
            transcript,
            testerNote: 'Auto-detected via ' + (usedChecklist ? 'the uploaded checklist (Gemini)' : 'built-in rules') + '. Ended reason: ' + message.endedReason,
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
