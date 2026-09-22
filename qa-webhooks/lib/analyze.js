// Compares a call transcript against the same rules we wrote into Nova's
// system prompt. This is deliberately rule-based (regex/keyword matching)
// rather than calling an LLM — it's free, fast, and directly explainable:
// each check maps to one sentence of the actual prompt. It will miss subtle
// phrasing an LLM-based judge would catch, but it's a legitimate first pass
// and costs nothing to run.
//
// Returns an array of issues: [{ expected, actual, severity, category }]
// An empty array means the call passed — no ticket should be created.

function parseTurns(transcript) {
  if (!transcript) return [];
  return transcript
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(AI|User):\s?(.*)$/);
      if (!match) return null;
      return { role: match[1], text: match[2] };
    })
    .filter(Boolean);
}

function checkPriceRange(turns, issues) {
  for (const turn of turns) {
    if (turn.role !== 'AI') continue;
    const dollarAmounts = turn.text.match(/\$[\d,]+(\.\d+)?/g);
    if (!dollarAmounts || dollarAmounts.length === 0) continue;

    // Looks like a range if there are 2+ dollar amounts, or a range word nearby.
    const hasRangeWord = /\b(to|between|ranges?|from)\b/i.test(turn.text);
    const looksLikeRange = dollarAmounts.length >= 2 || hasRangeWord;

    if (!looksLikeRange) {
      issues.push({
        expected: 'States a price range, not a single fixed number.',
        actual: 'Quoted a flat price with no range: "' + turn.text.trim() + '"',
        severity: 'Major',
        category: 'Prompt'
      });
      return; // one instance is enough to flag
    }
  }
}

function checkAiDisclosure(turns, issues) {
  for (let i = 0; i < turns.length - 1; i++) {
    const turn = turns[i];
    if (turn.role !== 'User') continue;
    const asksIfBot = /\b(are you (a )?(bot|ai|robot|real person|human)|is this a bot)\b/i.test(turn.text);
    if (!asksIfBot) continue;

    const reply = turns[i + 1];
    if (!reply || reply.role !== 'AI') continue;

    const disclosesAi = /\b(ai|assistant|virtual)\b/i.test(reply.text);
    if (!disclosesAi) {
      issues.push({
        expected: 'Discloses it is an AI assistant when asked directly.',
        actual: 'Did not disclose being an AI when asked: "' + reply.text.trim() + '"',
        severity: 'Blocker',
        category: 'Prompt'
      });
      return;
    }
  }
}

function checkConcreteSlots(turns, issues) {
  const timePattern = /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i;
  const bookingWords = /\b(book|appointment|schedule|slot|consultation|come in)\b/i;
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (turn.role !== 'AI') continue;
    const isOpenQuestion = /\bwhen (would|works|suits|is good)\b/i.test(turn.text);
    if (!isOpenQuestion) continue;

    const bookingContextHere = bookingWords.test(turn.text);
    const bookingContextBefore = i > 0 && bookingWords.test(turns[i - 1].text);
    const isBookingAsk = bookingContextHere || bookingContextBefore;

    if (isBookingAsk && !timePattern.test(turn.text)) {
      issues.push({
        expected: 'Offers concrete day/time options rather than an open-ended question.',
        actual: 'Asked an open-ended scheduling question instead of offering slots: "' + turn.text.trim() + '"',
        severity: 'Minor',
        category: 'Refinement'
      });
      return;
    }
  }
}

function checkHumanTransfer(turns, issues) {
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (turn.role !== 'User') continue;
    const asksForHuman = /\b(speak to (a )?(human|someone|staff|supervisor|manager|real person)|talk to (a )?(human|person|real person)|connect me (to )?(a )?(human|someone|person)|put me through|transfer me)\b/i.test(turn.text);
    if (!asksForHuman) continue;

    const reply = turns[i + 1];
    const mentionsTransfer = reply && /\b(transfer|connect(ing)? you)\b/i.test(reply.text || '');

    if (!reply || !mentionsTransfer) {
      issues.push({
        expected: 'Acknowledges the request and performs (or attempts) a transfer.',
        actual: reply
          ? 'Did not acknowledge a transfer: "' + reply.text.trim() + '"'
          : 'The call ended with no response to the request for a human.',
        severity: 'Blocker',
        category: 'System'
      });
      return;
    }
  }
}

function analyzeTranscript(transcript) {
  const turns = parseTurns(transcript);
  const issues = [];

  checkPriceRange(turns, issues);
  checkAiDisclosure(turns, issues);
  checkConcreteSlots(turns, issues);
  checkHumanTransfer(turns, issues);

  return issues;
}

module.exports = { analyzeTranscript, parseTurns };
