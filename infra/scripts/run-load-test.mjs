#!/usr/bin/env node
/**
 * Load-test driver.
 *
 * Creates a simulated LingoBusiness session through the dev simulator, then
 * runs the requested k6 profile against it and prints the summary.
 *
 *   node infra/scripts/run-load-test.mjs --profile 100
 *   node infra/scripts/run-load-test.mjs --profile 1000 --hold 120
 *   node infra/scripts/run-load-test.mjs --baseline
 *
 * k6 is not a project dependency (it is a Go binary): install it from
 * https://k6.io/docs/get-started/installation/ or run the container image
 * `grafana/k6`. The script says so rather than failing obscurely.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILES = { 100: 'viewers_100', 1000: 'viewers_1000', 5000: 'viewers_5000' };

function parseArgs(argv) {
  const args = { profile: '100', hold: '60', baseline: false, api: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--profile') args.profile = argv[++index];
    else if (value === '--hold') args.hold = argv[++index];
    else if (value === '--api') args.api = argv[++index];
    else if (value === '--baseline') args.baseline = true;
    else if (value === '--help' || value === '-h') args.help = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage: node infra/scripts/run-load-test.mjs [options]

  --profile <100|1000|5000>  Viewer fan-out profile (default 100)
  --hold <seconds>           How long each viewer stays connected (default 60)
  --baseline                 Run the HTTP baseline scenario instead
  --api <url>                API base URL (default $API_BASE_URL or http://localhost:4000)
`);
  process.exit(0);
}

const API = args.api ?? process.env.API_BASE_URL ?? 'http://localhost:4000';

async function main() {
  await requireK6();
  await requireApi();

  if (args.baseline) {
    await runK6(path.join(HERE, 'load', 'api-baseline.js'), { API_BASE_URL: API });
    return;
  }

  const scenario = PROFILES[args.profile];
  if (!scenario) {
    console.error(`Unknown profile "${args.profile}". Use one of: ${Object.keys(PROFILES).join(', ')}`);
    process.exit(1);
  }

  const code = await createSimulatedSession();
  console.log(`▸ simulated business session ready — access code ${code}`);
  console.log(`▸ profile ${args.profile} viewers, ${args.hold}s hold\n`);

  await runK6(path.join(HERE, 'load', 'realtime-viewers.js'), {
    API_BASE_URL: API,
    ACCESS_CODE: code,
    HOLD_SECONDS: args.hold,
    SCENARIO: scenario,
  });
}

async function requireK6() {
  const found = await new Promise((resolve) => {
    const child = spawn('k6', ['version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
  if (!found) {
    console.error(
      'k6 is not installed.\n' +
        '  macOS:  brew install k6\n' +
        '  Linux:  https://k6.io/docs/get-started/installation/\n' +
        '  Docker: docker run --rm -i --network host grafana/k6 run - <infra/scripts/load/realtime-viewers.js',
    );
    process.exit(1);
  }
}

async function requireApi() {
  try {
    const response = await fetch(`${API}/health`);
    if (!response.ok) throw new Error(`status ${response.status}`);
  } catch (error) {
    console.error(
      `The API is not answering at ${API} (${error.message}).\n` +
        'Start it with: AI_PROVIDER=mock ENABLE_DEV_SIMULATOR=true pnpm dev:api',
    );
    process.exit(1);
  }
}

/**
 * A load test must never bill a provider account, so the simulator is
 * mandatory here — it produces the same events with no OpenAI call.
 */
async function createSimulatedSession() {
  const response = await fetch(`${API}/api/v1/dev/business/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Load test',
      sourceLanguage: 'fr',
      targetLanguages: ['en', 'ar', 'es'],
      autoSpeak: true,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error(
      `Could not create a simulated session (${response.status}).\n` +
        'ENABLE_DEV_SIMULATOR must be true and AI_PROVIDER should be mock.\n' +
        body,
    );
    process.exit(1);
  }
  const payload = await response.json();
  return payload.accessCode ?? payload.session?.accessCode;
}

function runK6(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('k6', ['run', script], {
      stdio: 'inherit',
      env: { ...process.env, ...Object.fromEntries(Object.entries(env).map(([k, v]) => [k, String(v)])) },
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`k6 exited ${code}`))));
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
