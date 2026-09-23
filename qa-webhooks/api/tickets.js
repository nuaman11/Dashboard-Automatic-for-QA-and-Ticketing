// Tickets are stored in a Redis HASH ("tickets:data"), keyed by ticket id,
// so individual tickets can be updated in place (for Assign / status
// changes). Counters track calls tested, clean calls, and how many real
// calls were actually checked against the uploaded checklist, so the
// dashboard can show a real pass rate and a real "times checked" count.

const { getClient } = require('../lib/redis');

module.exports = async function handler(req, res) {
  const client = await getClient();

  if (req.method === 'GET') {
    const raw = await client.hGetAll('tickets:data');
    const tickets = Object.values(raw)
      .map((item) => JSON.parse(item))
      .sort((a, b) => b.createdAt - a.createdAt);

    const [callsTotal, callsClean, checklistRounds] = await Promise.all([
      client.get('stats:callsTotal'),
      client.get('stats:callsClean'),
      client.get('stats:checklistRounds')
    ]);

    res.status(200).json({
      tickets,
      stats: {
        callsTotal: Number(callsTotal) || 0,
        callsClean: Number(callsClean) || 0,
        checklistRounds: Number(checklistRounds) || 0
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
    if (status !== undefined) {
      // A retest cycle completed when a ticket is verified as fixed
      // (pass) or fails verification again (reopened) — either way,
      // one full "did we check it again" cycle just happened.
      if (status === 'Verified' || status === 'Reopened') {
        ticket.retests = (ticket.retests || 0) + 1;
      }
      ticket.status = status;
    }

    await client.hSet('tickets:data', id, JSON.stringify(ticket));
    res.status(200).json({ ticket });
    return;
  }

  if (req.method === 'POST') {
    // Manual ticket creation — a QA tester logging their own finding,
    // separate from the AI-detected tickets that come in through the
    // VAPI webhook. Ron was explicit about this: testers should be able
    // to add their own tickets based on what they noticed, not just
    // review what the AI flagged.
    const { issue, category, severity, scenario, expected, actual, transcript, testerNote } = req.body || {};
    if (!issue || !issue.trim()) {
      res.status(400).json({ error: 'Issue text is required' });
      return;
    }

    const allowedSeverity = ['Blocker', 'Major', 'Minor'];
    const id = 'MANUAL-' + Date.now();
    const ticket = {
      id,
      issue: issue.trim(),
      category: category || 'Other',
      severity: allowedSeverity.includes(severity) ? severity : 'Minor',
      scenario: (scenario && scenario.trim()) || 'Manually logged',
      round: 'manual',
      assignee: null,
      status: 'Unassigned',
      retests: 0,
      expected: (expected && expected.trim()) || 'N/A — manually logged ticket, no automated expectation.',
      actual: (actual && actual.trim()) || issue.trim(),
      transcript: (transcript && transcript.trim()) || '',
      testerNote: (testerNote && testerNote.trim()) || 'Manually logged by a QA tester.',
      devNote: '',
      createdAt: Date.now()
    };

    await client.hSet('tickets:data', id, JSON.stringify(ticket));
    res.status(201).json({ ticket });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};

