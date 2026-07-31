#!/usr/bin/env node
/**
 * One command from a fresh clone to a running product.
 *
 *   pnpm install && pnpm bootstrap
 *
 * It copies `.env.example` to `.env` (never overwriting one that exists),
 * generates real development secrets so nobody ships the placeholder values,
 * starts Postgres and Redis if Docker is available, applies migrations, seeds
 * demo data and builds the shared packages.
 *
 * Every step reports what it did and what it skipped. Nothing here needs an
 * OpenAI account: the default is `AI_PROVIDER=mock`.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';

const ROOT = process.cwd();
const steps = [];

function log(message) {
  console.log(message);
}

function record(name, status, detail) {
  steps.push({ name, status, detail });
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd: ROOT, ...options });
    child.on('error', () => resolve(1));
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

function has(command) {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

function portOpen(host, port, timeout = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

async function waitFor(host, port, label, attempts = 40) {
  for (let index = 0; index < attempts; index += 1) {
    if (await portOpen(host, port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  log(`  ! ${label} did not become reachable on ${host}:${port}`);
  return false;
}

/**
 * Real secrets, even in development.
 *
 * The template ships placeholders so the file is readable; leaving them in
 * place is how a dev-only signing key ends up in a staging deploy.
 */
function fillDevelopmentSecrets(envPath) {
  const generated = {
    SESSION_SIGNING_SECRET: randomBytes(48).toString('base64url'),
    AUTH_SECRET: randomBytes(48).toString('base64url'),
    ADMIN_API_TOKEN: randomBytes(24).toString('base64url'),
    TRANSCRIPT_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  };

  let content = readFileSync(envPath, 'utf8');
  const replaced = [];
  for (const [key, value] of Object.entries(generated)) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    const current = content.match(pattern)?.[0]?.slice(key.length + 1) ?? '';
    // Only replace the shipped placeholders, never a value someone chose.
    if (!current || /change-me|dev-only|do-not-use/i.test(current)) {
      content = pattern.test(content)
        ? content.replace(pattern, `${key}=${value}`)
        : `${content}\n${key}=${value}`;
      replaced.push(key);
    }
  }
  if (replaced.length > 0) writeFileSync(envPath, content);
  return replaced;
}

async function main() {
  log('\nLingoLive bootstrap\n===================\n');

  // 1. Environment file
  const envPath = path.join(ROOT, '.env');
  if (existsSync(envPath)) {
    record('.env', 'kept', 'already present — not modified');
    log('▸ .env already exists, leaving it untouched');
  } else {
    copyFileSync(path.join(ROOT, '.env.example'), envPath);
    const replaced = fillDevelopmentSecrets(envPath);
    record('.env', 'created', `generated ${replaced.length} development secrets`);
    log(`▸ created .env and generated ${replaced.join(', ')}`);
  }

  // 2. Databases
  const dockerAvailable = await has('docker');
  const postgresUp = await portOpen('127.0.0.1', 5432);
  const redisUp = await portOpen('127.0.0.1', 6379);

  if (postgresUp && redisUp) {
    record('services', 'reused', 'Postgres and Redis already listening');
    log('▸ Postgres and Redis are already running');
  } else if (dockerAvailable) {
    log('▸ starting Postgres and Redis with Docker Compose…');
    const code = await run('docker', ['compose', '-f', 'infra/docker-compose.yml', 'up', '-d']);
    if (code === 0) {
      await waitFor('127.0.0.1', 5432, 'Postgres');
      await waitFor('127.0.0.1', 6379, 'Redis');
      record('services', 'started', 'docker compose up -d');
    } else {
      record('services', 'failed', 'docker compose failed — start Postgres/Redis manually');
      log('  ! docker compose failed. Start Postgres and Redis yourself, then re-run.');
    }
  } else {
    record('services', 'skipped', 'Docker not available');
    log(
      '▸ Docker is not available. Start PostgreSQL 16 on :5432 and Redis on :6379 yourself,\n' +
        '  or point DATABASE_URL / REDIS_URL at existing instances.\n' +
        '  (REDIS_URL may be left empty: the API then runs single-instance.)',
    );
  }

  // 3. Schema and demo data
  if (await portOpen('127.0.0.1', 5432)) {
    log('▸ applying database migrations…');
    const migrate = await run('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
    record('migrations', migrate === 0 ? 'applied' : 'failed');

    if (migrate === 0) {
      log('▸ generating the Prisma client…');
      await run('pnpm', ['exec', 'prisma', 'generate', '--schema', 'prisma/schema.prisma']);

      log('▸ seeding demo data…');
      const seed = await run('pnpm', ['exec', 'tsx', 'prisma/seed.ts']);
      record('seed', seed === 0 ? 'seeded' : 'failed');
    }
  } else {
    record('migrations', 'skipped', 'no database reachable on :5432');
  }

  // 4. Shared packages — the apps import them from dist/
  log('▸ building shared packages…');
  const build = await run('pnpm', ['run', 'build:packages']);
  record('packages', build === 0 ? 'built' : 'failed');

  // 5. Summary
  log('\nSummary\n-------');
  for (const step of steps) {
    const detail = step.detail ? ` — ${step.detail}` : '';
    log(`  ${step.status === 'failed' ? '✗' : '✓'} ${step.name}: ${step.status}${detail}`);
  }

  const failed = steps.some((step) => step.status === 'failed');
  log(
    failed
      ? '\nSomething did not complete. Fix the step above and re-run `pnpm bootstrap`.\n'
      : '\nReady. Next:\n' +
          '  pnpm dev          # API :4000, web :3000, worker\n' +
          '  pnpm dev:mobile   # Expo — requires a development build, see docs/DEPLOYMENT.md\n' +
          '\nEverything runs with AI_PROVIDER=mock: no OpenAI account required.\n',
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
