// api/_bio-translate.js - the mechanic's bio in Spanish and Chinese.
//
// Diego writes the bio once, in English, in Admin > Mechanic Profiles. The
// landing, the app and the tracking page used to show that English text in
// all three languages. Now saving the profile asks the server to translate it
// (handleAdminTranslateBio in api/auth.js), which stores the result in
// escalation_contacts.bio_es / bio_zh (scripts/add-mechanic-bio-translations.sql).
//
// Raw fetch, like api/chat.js: the project calls the API directly and does not
// use @anthropic-ai/sdk. Structured output, so the answer is always the two
// strings and never prose around them.

const TIMEOUT_MS = 20000;
// A bio is a sentence or two. Anything far longer than the source is not a
// translation of it.
const MAX_OUT = 2000;

const SYSTEM =
  'You translate the short public profile bio of a bicycle mechanic for the website of ' +
  'Dr. Bike Sydney, a mobile bike repair business in Sydney, Australia. Translate the bio ' +
  'into neutral Spanish (understood across Latin America and Spain) and Simplified Chinese. ' +
  'Keep the meaning, tone and length of the original; keep names, numbers and brand names ' +
  'as they are; do not add anything that is not in the original.';

const SCHEMA = {
  type: 'object',
  properties: {
    es: { type: 'string' },
    zh: { type: 'string' },
  },
  required: ['es', 'zh'],
  additionalProperties: false,
};

export async function translateBio(bio, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const apiKey = deps.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  const text = String(bio || '').trim();
  if (!text) throw new Error('nothing to translate');

  const resp = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // If a safety classifier declines, the API re-runs the request on its
      // recommended fallback model instead of returning a refusal.
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-5-5',
      // Room for the model's thinking as well as the two short strings.
      max_tokens: 8000,
      fallbacks: 'default',
      // A two-sentence translation needs little thought.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: text }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok)
    throw new Error(`Anthropic HTTP ${resp.status}: ${data?.error?.message || 'no detail'}`);
  if (data.stop_reason === 'refusal') throw new Error('the model declined to translate this bio');
  if (data.stop_reason === 'max_tokens') throw new Error('the translation was cut off');

  const block = (data.content || []).find((b) => b.type === 'text');
  let out;
  try {
    out = JSON.parse(block?.text || '');
  } catch {
    throw new Error('the translation did not come back as JSON');
  }
  const es = String(out?.es || '').trim();
  const zh = String(out?.zh || '').trim();
  if (!es || !zh) throw new Error('the translation came back empty');
  if (es.length > MAX_OUT || zh.length > MAX_OUT)
    throw new Error('the translation came back too long');
  return { es, zh };
}
