#!/usr/bin/env node
/**
 * Apply migrations, waiting for the database to accept connections first.
 *
 * `prisma migrate deploy` does not retry. On a first Blueprint apply the API's
 * pre-deploy step runs while PostgreSQL is still being provisioned, so the very
 * first deploy of a new environment fails with:
 *
 *   Error: P1001: Can't reach database server at `dpg-...:5432`
 *
 * Nothing is actually wrong — the database appears a minute or two later — but
 * the deploy is already marked failed and a human has to notice and retry. The
 * same thing happens on any redeploy that lands during a database maintenance
 * window.
 *
 * So: retry on P1001 only, with backoff, for a bounded time. Any other failure
 * — a bad migration, a permissions problem — fails immediately and loudly,
 * because retrying those just delays a real error.
 *
 *   node infra/scripts/migrate.mjs
 *   node infra/scripts/migrate.mjs --timeout 600
 */
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const timeoutIndex = args.indexOf('--timeout');
const TIMEOUT_SECONDS = timeoutIndex === -1 ? 300 : Number(args[timeoutIndex + 1]);

/** P1001 is Prisma's "cannot reach the database server". */
const UNREACHABLE = /P1001|Can't reach database server|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i;

function runMigrate() {
  return new Promise((resolve) => {
    const child = spawn(
      'pnpm',
      ['exec', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let output = '';
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk) => {
        const text = String(chunk);
        output += text;
        process.stdout.write(text);
      });
    }

    child.on('error', (error) => resolve({ code: 1, output: `${output}\n${error.message}` }));
    child.on('exit', (code) => resolve({ code: code ?? 1, output }));
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const deadline = Date.now() + TIMEOUT_SECONDS * 1000;
  let attempt = 0;

  for (;;) {
    attempt += 1;
    const { code, output } = await runMigrate();

    if (code === 0) {
      if (attempt > 1) console.log(`\nMigrations applied on attempt ${attempt}.`);
      process.exit(0);
    }

    if (!UNREACHABLE.test(output)) {
      // A real migration failure. Retrying would only hide it.
      console.error('\nMigration failed for a reason that will not fix itself. Not retrying.');
      process.exit(code);
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      console.error(
        `\nThe database was still unreachable after ${TIMEOUT_SECONDS}s.\n` +
          'On a brand-new environment, provisioning can take a few minutes — ' +
          'redeploy once the database shows as available.',
      );
      process.exit(1);
    }

    // 5s, 10s, 20s, then every 30s.
    const delay = Math.min(5000 * 2 ** (attempt - 1), 30_000);
    console.log(
      `\nDatabase not reachable yet (attempt ${attempt}). ` +
        `Retrying in ${Math.round(delay / 1000)}s — ${Math.round(remaining / 1000)}s left.\n`,
    );
    await wait(Math.min(delay, remaining));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
