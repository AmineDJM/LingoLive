#!/usr/bin/env node
/**
 * Provider preflight.
 *
 * Answers the question "which model do I put in OPENAI_TRANSLATION_MODEL?"
 * against the account that will actually run in production, and then proves
 * the answer by making the *exact* call LingoLive makes — same endpoint, same
 * JSON mode, same prompt shape, same parsing.
 *
 * This exists because model identifiers change, and because a translation
 * model that is subtly wrong fails in a confusing way: transcription keeps
 * working (different endpoint) while every translation returns
 * TRANSLATION_FAILED.
 *
 *   node infra/scripts/check-provider.mjs                  # list candidates
 *   node infra/scripts/check-provider.mjs --try gpt-x-mini # test one model
 *   node infra/scripts/check-provider.mjs --all            # test every candidate
 *
 * Reads OPENAI_API_KEY from the environment or from .env. The key is never
 * printed, never written anywhere, and the only network calls are to
 * OPENAI_BASE_URL.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

// --- configuration -----------------------------------------------------------

function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) out[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const dotenv = loadDotEnv();
const env = (key, fallback) => process.env[key] ?? dotenv[key] ?? fallback;

const API_KEY = env('OPENAI_API_KEY', '');
const BASE_URL = env('OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, '');
const TRANSCRIPTION_MODEL = env('OPENAI_TRANSCRIPTION_MODEL', 'gpt-live-transcribe');
const TRANSLATION_MODEL = env('OPENAI_TRANSLATION_MODEL', '');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};

if (flag('--help') || flag('-h')) {
  console.log(`Usage: node infra/scripts/check-provider.mjs [options]

  (no options)     List the account's models, split into translation candidates
  --try <model>    Run LingoLive's real translation call against one model
  --all            Try every candidate and rank them by latency
  --json           Machine-readable output
`);
  process.exit(0);
}

if (!API_KEY) {
  console.error(
    'OPENAI_API_KEY is not set.\n' +
      'Export it for this shell only — do not add it to a file that gets committed:\n' +
      '  export OPENAI_API_KEY=...\n',
  );
  process.exit(1);
}

// --- model discovery ---------------------------------------------------------

/**
 * Models that cannot serve /chat/completions, by what they are for.
 * Matching on purpose-words rather than on a version list, so a new
 * `-realtime-` or `-transcribe-` model is excluded without an edit here.
 */
const NOT_TEXT =
  /realtime|transcribe|whisper|tts|audio|speech|embedding|moderation|image|dall-e|sora|search|computer-use/i;

async function listModels() {
  const response = await fetch(`${BASE_URL}/models`, {
    headers: { authorization: `Bearer ${API_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `GET /models returned ${response.status}. ` +
        (response.status === 401
          ? 'The key is invalid or revoked.'
          : 'Check OPENAI_BASE_URL and the key’s permissions.'),
    );
  }
  const payload = await response.json();
  return (payload.data ?? []).map((model) => model.id).sort();
}

// --- the real call -----------------------------------------------------------

/**
 * Byte-for-byte the request `OpenAiTranslationProvider.requestTranslations`
 * makes. If this succeeds, the model works in production; if it fails, it
 * fails here instead of in front of a user.
 */
const SYSTEM = [
  'You are a translation engine inside a live captioning product.',
  'Translate the user text faithfully into every requested language.',
  'Rules:',
  '- Preserve numbers, dates, units, currency amounts and proper nouns exactly.',
  '- Preserve the register and the punctuation of the source.',
  '- Do not add, remove, explain, summarise or comment.',
  '- If the text is incomplete, translate what is there without completing it.',
  'Reply with JSON only, of the form {"translations":{"<language code>":"<text>"}}.',
].join('\n');

// A sentence with the things that actually break translation: a number, a
// unit, a proper noun, and three target scripts including RTL.
const SAMPLE_TEXT =
  'Le docteur Nadia Belkacem vous prescrit 500 mg deux fois par jour pendant 7 jours.';
const SAMPLE_TARGETS = [
  ['en', 'English'],
  ['ar', 'Arabic'],
  ['pt-BR', 'Portuguese (Brazil)'],
];

async function tryTranslation(model) {
  const user =
    `Source language: fr\n` +
    `Target languages: ${SAMPLE_TARGETS.map(([code, name]) => `"${code}" (${name})`).join(', ')}\n\n` +
    `Text:\n${SAMPLE_TEXT}`;

  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      }),
      // The production call allows 15 s; anything near that is unusable live.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return { model, ok: false, reason: `unreachable or timed out (${error.name})` };
  }

  const elapsedMs = Date.now() - startedAt;

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error?.message ?? '';
    } catch {
      /* ignore */
    }
    return {
      model,
      ok: false,
      elapsedMs,
      reason: `HTTP ${response.status}${detail ? ` — ${detail.slice(0, 160)}` : ''}`,
    };
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return { model, ok: false, elapsedMs, reason: 'no content in the response' };

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { model, ok: false, elapsedMs, reason: 'response was not valid JSON' };
  }

  const translations = parsed.translations ?? {};
  const missing = SAMPLE_TARGETS.map(([code]) => code).filter(
    (code) => typeof (translations[code] ?? translations[code.toLowerCase()]) !== 'string',
  );

  return {
    model,
    ok: missing.length === 0,
    elapsedMs,
    ...(missing.length > 0 ? { reason: `missing languages: ${missing.join(', ')}` } : {}),
    translations,
    // The two checks a human should still eyeball: the dose survived, and the
    // Arabic is actually Arabic script.
    keptTheNumbers:
      /500/.test(JSON.stringify(translations)) && /7/.test(JSON.stringify(translations)),
    arabicIsArabic: /[؀-ۿ]/.test(translations.ar ?? ''),
    inputTokens: payload.usage?.prompt_tokens ?? null,
    outputTokens: payload.usage?.completion_tokens ?? null,
  };
}

// --- output ------------------------------------------------------------------

function printResult(result) {
  if (!result.ok) {
    console.log(`  ✗ ${result.model} — ${result.reason}`);
    return;
  }
  console.log(`  ✓ ${result.model} — ${result.elapsedMs} ms, 3 languages in one call`);
  for (const [code] of SAMPLE_TARGETS) {
    const text = result.translations[code] ?? result.translations[code.toLowerCase()];
    console.log(`      ${code.padEnd(6)} ${text}`);
  }
  if (!result.keptTheNumbers) console.log('      ! the dose or the duration did not survive');
  if (!result.arabicIsArabic) console.log('      ! the Arabic is not in Arabic script');
  if (result.inputTokens !== null) {
    console.log(`      tokens: ${result.inputTokens} in, ${result.outputTokens} out`);
  }
}

async function main() {
  const models = await listModels();

  const candidates = models.filter((id) => !NOT_TEXT.test(id));
  const audio = models.filter((id) => NOT_TEXT.test(id));

  const single = value('--try');
  const testAll = flag('--all');

  if (!single && !testAll) {
    console.log(`\nAccount models at ${BASE_URL} — ${models.length} total\n`);

    console.log('Translation candidates (text models — /chat/completions):');
    for (const id of candidates) console.log(`  ${id}`);
    if (candidates.length === 0) {
      console.log('  (none — this key may be scoped to audio models only)');
    }

    console.log('\nNot usable for translation (wrong endpoint):');
    for (const id of audio) console.log(`  ${id}`);

    console.log(`\nTranscription model configured: ${TRANSCRIPTION_MODEL}`);
    console.log(
      models.includes(TRANSCRIPTION_MODEL)
        ? '  ✓ present in this account'
        : '  ✗ NOT present in this account — the realtime session will fail',
    );

    console.log(`\nTranslation model configured: ${TRANSLATION_MODEL || '(unset)'}`);
    if (!TRANSLATION_MODEL) {
      console.log('  Pick one from the candidates above, then prove it:');
      console.log('    node infra/scripts/check-provider.mjs --all');
    } else if (!models.includes(TRANSLATION_MODEL)) {
      console.log('  ✗ NOT present in this account');
    } else if (NOT_TEXT.test(TRANSLATION_MODEL)) {
      console.log('  ✗ this is an audio/realtime model — every translation will fail');
    } else {
      console.log('  ✓ present and text-shaped. Prove it with --try ' + TRANSLATION_MODEL);
    }
    console.log('');
    return;
  }

  const toTest = single ? [single] : candidates;
  if (toTest.length === 0) {
    console.log('No candidates to test.');
    return;
  }

  console.log(`\nRunning LingoLive's real translation call against ${toTest.length} model(s).`);
  console.log(`Source (fr): ${SAMPLE_TEXT}\n`);

  const results = [];
  for (const model of toTest) {
    const result = await tryTranslation(model);
    results.push(result);
    printResult(result);
    console.log('');
  }

  if (flag('--json')) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const working = results.filter((r) => r.ok).sort((a, b) => a.elapsedMs - b.elapsedMs);
  if (working.length === 0) {
    console.log('Nothing worked. Check the key’s model permissions.');
    process.exit(1);
  }

  console.log('Fastest models that produced all three languages correctly:');
  for (const result of working.slice(0, 5)) {
    console.log(`  ${result.elapsedMs} ms  ${result.model}`);
  }
  console.log(
    `\nSet OPENAI_TRANSLATION_MODEL to one of these in Render.\n` +
      `Latency matters more than raw capability here: this call sits between a\n` +
      `sentence being spoken and a person reading it, with a budget of ~800 ms.\n`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
