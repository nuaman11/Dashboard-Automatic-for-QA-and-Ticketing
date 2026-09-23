// Uses Google Gemini (free tier, no credit card required via Google AI
// Studio) to compare a real call transcript against the QA checklist
// currently loaded from the dashboard's "QA checklist" upload.
//
// Requires GEMINI_API_KEY as an environment variable. If that's not set,
// or no checklist has been uploaded, the caller (api/webhook-vapi.js)
// falls back to the fixed regex rules in lib/analyze.js.
//
// Exports the same function signature as before, so nothing else in the
// project needs to change to use this instead of a paid API.

async function analyzeWithChecklist(transcript, checklist) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  if (!checklist || checklist.length === 0) {
    throw new Error('No checklist loaded');
  }

  const checklistText = checklist
    .map((row) => `[${row.id}] You say: "${row.youSay}" — Agent should: "${row.agentShould}"`)
    .join('\n');

  const prompt = `You are a QA analyst reviewing a phone call transcript for an AI voice assistant, against a written checklist of expected behaviors.

For EACH checklist item, decide:
1. "tested": was this scenario actually touched on during this specific call (true/false)? Only mark true if that topic genuinely came up in the conversation.
2. If tested is true, "passed": did the assistant's actual behavior meet the "Agent should" expectation (true/false)?
3. If passed is false, "actual": a short quote (under 200 characters) of what the assistant actually said that fell short.
4. If passed is false, "severity": one of "Blocker", "Major", "Minor" — Blocker for things that could mislead or harm a customer (false commitments, dropped human-transfer requests), Major for a clear rule violation, Minor for a small refinement.
5. If passed is false, "category": one of "Prompt", "System", "Refinement".

Respond with ONLY a JSON object in exactly this shape, nothing else:
{"results": [{"id": "T1", "tested": true, "passed": false, "actual": "...", "severity": "Major", "category": "Prompt"}]}

Include every checklist item in "results". For items that were not tested, just include {"id": "T1", "tested": false}.

Checklist:
${checklistText}

Call transcript:
${transcript}`;

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Gemini API error ' + response.status + ': ' + errText);
  }

  const data = await response.json();
  const candidate = data.candidates && data.candidates[0];
  const part = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];
  if (!part || !part.text) throw new Error('No text content in Gemini response');

  let cleaned = part.text.trim();
  // Defensive: strip markdown fences in case the model adds them anyway,
  // even with responseMimeType set to application/json
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');

  const parsed = JSON.parse(cleaned);
  return parsed.results || [];
}

module.exports = { analyzeWithChecklist };
