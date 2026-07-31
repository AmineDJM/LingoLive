#!/usr/bin/env node
/**
 * Blueprint preflight.
 *
 * Runs the environment each Render service would boot with through the API's
 * real configuration schema, so a deployment that the schema would reject
 * fails here — in seconds, with the reason — instead of after a Blueprint
 * apply, five services in, in a log the operator has to go find.
 *
 * This exists because it already caught one: the staging API set
 * ENABLE_DEV_SIMULATOR=true with APP_ENV=staging, a combination the schema
 * refuses. Nothing in the YAML looked wrong, and nothing would have said so
 * until the service failed to start.
 *
 *   node infra/scripts/validate-blueprint.mjs
 *
 * Values Render supplies at deploy time (`fromService`, `fromDatabase`,
 * `generateValue`, `sync: false`) are stood in for with placeholders of the
 * right shape — the point is to check the combinations the file *does* fix,
 * not to guess secrets.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BLUEPRINT = path.join(ROOT, 'infra', 'render.yaml');

/**
 * Stand-ins for values only Render can provide. Shaped to satisfy the schema's
 * format rules so a failure is about a *combination*, never about a placeholder.
 */
const PLACEHOLDERS = {
  DATABASE_URL: 'postgresql://user:pass@host:5432/lingolive?schema=public',
  REDIS_URL: 'redis://host:6379',
  SESSION_SIGNING_SECRET: 'placeholder-session-signing-secret-48-chars-long',
  AUTH_SECRET: 'placeholder-auth-secret-value-48-characters-long',
  ADMIN_API_TOKEN: 'placeholder-admin-token-32-characters',
  TRANSCRIPT_ENCRYPTION_KEY: 'placeholder-transcript-encryption-secret-48c',
  OPENAI_API_KEY: 'placeholder-openai-key',
  OPENAI_TRANSLATION_MODEL: 'placeholder-text-model',
  ADMIN_EMAILS: 'operator@example.com',
  APP_BASE_URL: 'https://app.example.com',
  WEB_BASE_URL: 'https://app.example.com',
  API_BASE_URL: 'https://api.example.com',
  CORS_ALLOWED_ORIGINS: 'https://app.example.com',
};

function envForService(service) {
  const env = {};
  for (const entry of service.envVars ?? []) {
    if (Object.hasOwn(entry, 'value')) {
      env[entry.key] = String(entry.value);
      continue;
    }
    // fromService / fromDatabase / generateValue / sync:false — Render fills
    // these in. Only their presence matters to the schema.
    env[entry.key] = PLACEHOLDERS[entry.key] ?? 'placeholder-value-of-sufficient-length';
  }
  return env;
}

async function main() {
  const blueprint = parseYaml(readFileSync(BLUEPRINT, 'utf8'));
  const { parseServerEnv } = await import(
    path.join(ROOT, 'packages', 'config', 'dist', 'index.js')
  ).catch(() => {
    throw new Error('Run `pnpm run build:packages` first — @lingolive/config is not built.');
  });

  const failures = [];
  let checked = 0;

  console.log('\nValidating infra/render.yaml against the API configuration schema\n');

  for (const service of blueprint.services ?? []) {
    // Only Node services boot the API config; the web app and key-value stores
    // have their own, much smaller, contract.
    const runsTheApi =
      service.startCommand?.includes('apps/api/dist/server.js') ||
      service.startCommand?.includes('apps/worker/dist/index.js');
    if (!runsTheApi) continue;

    checked += 1;
    try {
      parseServerEnv(envForService(service));
      console.log(`  ✓ ${service.name}`);
    } catch (error) {
      failures.push({ name: service.name, message: String(error.message) });
      console.log(`  ✗ ${service.name} — would refuse to boot`);
    }
  }

  // A few invariants the schema cannot express, because they are about the
  // relationship between services rather than about one environment.
  const structural = [];
  const byName = new Map((blueprint.services ?? []).map((s) => [s.name, s]));

  for (const service of blueprint.services ?? []) {
    for (const entry of service.envVars ?? []) {
      const ref = entry.fromService?.name;
      if (ref && !byName.has(ref) && !(blueprint.databases ?? []).some((d) => d.name === ref)) {
        structural.push(`${service.name}.${entry.key} references unknown service "${ref}"`);
      }
      // A pinned branch is what broke the first Blueprint apply: it validates
      // only on a repository that happens to use that branch name.
      if (Object.hasOwn(service, 'branch')) {
        structural.push(`${service.name} pins branch "${service.branch}" — omit it`);
      }
    }
  }

  // The worker decrypts what the API encrypted. Different keys is a bug that
  // only surfaces the first time the worker touches encrypted data.
  for (const service of blueprint.services ?? []) {
    if (!service.startCommand?.includes('worker')) continue;
    const key = (service.envVars ?? []).find((e) => e.key === 'TRANSCRIPT_ENCRYPTION_KEY');
    if (key && !key.fromService) {
      structural.push(
        `${service.name}.TRANSCRIPT_ENCRYPTION_KEY is not pulled from its API service — ` +
          'the two would hold different keys',
      );
    }
  }

  const uniqueStructural = [...new Set(structural)];
  if (uniqueStructural.length > 0) {
    console.log('');
    for (const problem of uniqueStructural) console.log(`  ✗ ${problem}`);
  }

  if (failures.length === 0 && uniqueStructural.length === 0) {
    console.log(`\n✓ ${checked} service(s) would boot.\n`);

    const mustFill = [];
    for (const service of blueprint.services ?? []) {
      for (const entry of service.envVars ?? []) {
        if (entry.sync === false) mustFill.push(`${service.name} → ${entry.key}`);
      }
    }
    if (mustFill.length > 0) {
      console.log('Values a human still has to enter in the Render dashboard:');
      for (const item of mustFill) console.log(`  ${item}`);
      console.log('');
    }
    return;
  }

  for (const failure of failures) {
    console.log(`\n${failure.name}:`);
    for (const line of failure.message.split('\n').slice(0, 20)) console.log(`  ${line}`);
  }
  console.log('');
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
