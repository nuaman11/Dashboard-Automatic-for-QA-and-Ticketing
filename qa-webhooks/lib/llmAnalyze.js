// Uses Claude (Anthropic API) to compare a real call transcript against
// the QA checklist currently loaded from the dashboard's "QA checklist"
// upload. This replaces guessing at regex patterns for arbitrary,
// user-written "Agent should" text — that kind of free-form comparison
// genuinely needs language understanding, not pattern matching.
//
// Requires ANTHROPIC_API_KEY as an environment variable. If that's not
// set, or no checklist has been uploaded, the caller should fall back to
// the fixed regex rules in lib/analyze.js.

async function analyzeWithChecklist(transcript, checklist) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  if (!checklist || checklist.length === 0) {
    throw new Error('No checklist loaded');
  }

  const checklistText = checklist
    .map((row) => `[${row.id}] You say: "${row.youSay}" — Agent should: "${row.agentShould}"`)
    .join('\n');

  const systemPrompt = `You are a QA analyst reviewing a phone call transcript for an AI voice assistant, against a written checklist of expected behaviors.

For EACH checklist item, decide:
1. "tested": was this scenario actually touched on during this specific call (true/false)? Only mark true if that topic genuinely came up in the conversation.
2. If tested is true, "passed": did the assistant's actual behavior meet the "Agent should" expectation (true/false)?
3. If passed is false, "actual": a short quote (under 200 characters) of what the assistant actually said that fell short.
4. If passed is false, "severity": one of "Blocker", "Major", "Minor" — Blocker for things that could mislead or harm a customer (false commitments, dropped human-transfer requests), Major for a clear rule violation, Minor for a small refinement.
5. If passed is false, "category": one of "Prompt", "System", "Refinement".

Respond with ONLY a JSON object, no other text, no markdown code fences, in exactly this shape:
{"results": [{"id": "T1", "tested": true, "passed": false, "actual": "...", "severity": "Major", "category": "Prompt"}]}

Include every checklist item in "results". For items that were not tested, just include {"id": "T1", "tested": false}.`;

  const userPrompt = `Checklist:\n${checklistText}\n\nCall transcript:\n${transcript}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Anthropic API error ' + response.status + ': ' + errText);
  }

  const data = await response.json();
  const textBlock = data.content && data.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text content in Claude response');

  let cleaned = textBlock.text.trim();
  // Defensive: strip markdown fences in case the model adds them anyway
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');

  const parsed = JSON.parse(cleaned);
  return parsed.results || [];
}

module.exports = { analyzeWithChecklist };
