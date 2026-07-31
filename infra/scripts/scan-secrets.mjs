#!/usr/bin/env node
/**
 * Secret scanner — runs in CI and in `pnpm check:all`.
 *
 * Three separate checks, because they fail for different reasons:
 *
 *  1. **Committed credentials.** Pattern-matches every tracked file for
 *     provider keys, private keys and connection strings with real passwords.
 *  2. **Client-exposed provider keys.** The rule the specification is
 *     absolute about: the OpenAI key exists on the server and nowhere else.
 *     Any `EXPO_PUBLIC_*`/`NEXT_PUBLIC_*` name that mentions a provider, and
 *     any provider SDK imported from client code, is a build-breaking error.
 *  3. **Built bundles.** If `apps/web/.next` or an Expo export exists, the
 *     emitted JavaScript is searched for key material — the only check that
 *     proves what actually ships.
 *
 * Exit code 1 on any finding. No network access, no dependencies.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const findings = [];

/** Patterns that indicate a real credential rather than a placeholder. */
const CREDENTIAL_PATTERNS = [
  { name: 'OpenAI API key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'OpenAI project key', pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Stripe secret key', pattern: /\bsk_(live|test)_[A-Za-z0-9]{20,}\b/ },
  { name: 'Stripe webhook secret', pattern: /\bwhsec_[A-Za-z0-9]{20,}\b/ },
  { name: 'RevenueCat secret key', pattern: /\bsk_[A-Za-z0-9]{32,}\b/ },
  { name: 'AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Slack token', pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Private key block', pattern: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'Sentry DSN with key', pattern: /https:\/\/[0-9a-f]{32}@[\w.-]*ingest[\w.-]*\// },
  {
    name: 'Database URL with a non-placeholder password',
    pattern: /postgres(ql)?:\/\/[^\s:'"]+:(?!lingolive@|password@|postgres@|\$\{)[^\s:@'"]{8,}@/,
  },
];

/** Public env names that must never mention a provider or a secret. */
const CLIENT_ENV_PATTERN =
  /\b(EXPO_PUBLIC|NEXT_PUBLIC)_[A-Z0-9_]*(OPENAI|ANTHROPIC|SECRET|PRIVATE|API_KEY|APIKEY|TOKEN|PASSWORD|DSN_SECRET|SERVICE_ACCOUNT)[A-Z0-9_]*\b/;

/** The allow-list of public names that legitimately contain "KEY". */
const CLIENT_ENV_ALLOWED = new Set([
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'EXPO_PUBLIC_POSTHOG_KEY',
]);

/** Client-side source trees: no provider SDK may be imported from these. */
const CLIENT_TREES = ['apps/web/app', 'apps/web/components', 'apps/web/lib', 'apps/mobile'];
const SERVER_ONLY_MODULES = [/from ['"]openai['"]/, /require\(['"]openai['"]\)/];

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.turbo',
  'dist',
  'build',
  '.expo',
  'coverage',
  'playwright-report',
  'test-results',
]);

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.zip',
  '.keystore',
  '.jks',
  '.p8',
  '.p12',
  '.mobileprovision',
]);

function report(severity, file, message, line) {
  findings.push({ severity, file, message, line });
}

function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 })
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
  } catch {
    console.error('scan-secrets: not a git repository — falling back to a filesystem walk');
    return null;
  }
}

async function walk(directory, out = []) {
  let entries;
  try {
    entries = await readdir(path.join(ROOT, directory), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(relative, out);
    else out.push(relative);
  }
  return out;
}

function readText(file) {
  try {
    const stats = statSync(path.join(ROOT, file));
    // A 5 MB source file is not a source file.
    if (stats.size > 5 * 1024 * 1024) return null;
    return readFileSync(path.join(ROOT, file), 'utf8');
  } catch {
    return null;
  }
}

function isScannable(file) {
  if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) return false;
  if (file.startsWith('pnpm-lock.yaml')) return false;
  return true;
}

/**
 * Files that necessarily contain the forbidden names *in order to ban them*:
 * this scanner and the ESLint rule that enforces the same thing at edit time.
 */
const RULE_DECLARATION_FILES = new Set(['infra/scripts/scan-secrets.mjs', 'eslint.config.mjs']);

function declaresTheRules(file) {
  return RULE_DECLARATION_FILES.has(file);
}

function scanCredentials(file, content) {
  const lines = content.split('\n');
  for (const [index, line] of lines.entries()) {
    // An example, a placeholder or a documented shape is not a credential.
    if (/#\s*example|placeholder|redacted|your-key-here|<[A-Z_]+>/i.test(line)) continue;
    for (const { name, pattern } of CREDENTIAL_PATTERNS) {
      if (pattern.test(line)) {
        report('error', file, `Possible ${name} committed`, index + 1);
      }
    }
  }
}

function scanClientEnvNames(file, content) {
  const lines = content.split('\n');
  for (const [index, line] of lines.entries()) {
    const match = line.match(CLIENT_ENV_PATTERN);
    if (!match) continue;
    if (CLIENT_ENV_ALLOWED.has(match[0])) continue;
    report(
      'error',
      file,
      `${match[0]} is bundled into the client — a provider key must never be public`,
      index + 1,
    );
  }
}

function scanClientImports(file, content) {
  if (!CLIENT_TREES.some((tree) => file.startsWith(tree))) return;
  const lines = content.split('\n');
  for (const [index, line] of lines.entries()) {
    for (const pattern of SERVER_ONLY_MODULES) {
      if (pattern.test(line)) {
        report(
          'error',
          file,
          'The OpenAI SDK is imported from client code; provider calls belong to the API',
          index + 1,
        );
      }
    }
    if (/process\.env\.OPENAI_API_KEY/.test(line)) {
      report('error', file, 'OPENAI_API_KEY is referenced from client code', index + 1);
    }
  }
}

function scanEnvFileTracked(files) {
  for (const file of files) {
    const base = path.basename(file);
    if (base === '.env' || /^\.env\.(local|development|production|staging)$/.test(base)) {
      report('error', file, 'A .env file is tracked by git');
    }
    if (/google-play-service-account\.json$/.test(file)) {
      report('error', file, 'A Play Store service account key is tracked by git');
    }
    if (/\.(p8|p12|keystore|jks|mobileprovision)$/.test(file)) {
      report('error', file, 'A signing credential is tracked by git');
    }
  }
}

async function scanBuiltBundles() {
  const targets = ['apps/web/.next/static', 'apps/mobile/dist', 'apps/web/out'];
  for (const target of targets) {
    if (!existsSync(path.join(ROOT, target))) continue;
    const files = (await walk(target)).filter((file) => /\.(js|mjs|cjs|json|map)$/.test(file));
    for (const file of files) {
      const content = readText(file);
      if (!content) continue;
      for (const { name, pattern } of CREDENTIAL_PATTERNS) {
        if (pattern.test(content)) {
          report('error', file, `${name} found in a BUILT client bundle`);
        }
      }
      if (/OPENAI_API_KEY/.test(content)) {
        report('error', file, 'OPENAI_API_KEY appears in a built client bundle');
      }
    }
    console.log(`  scanned ${files.length} built files in ${target}`);
  }
}

async function main() {
  console.log('scan-secrets: checking the working tree…');

  const tracked = trackedFiles();
  const files = tracked ?? (await walk('.'));

  if (tracked) scanEnvFileTracked(tracked);

  let scanned = 0;
  for (const file of files) {
    if (!isScannable(file) || declaresTheRules(file)) continue;
    const content = readText(file);
    if (content === null) continue;
    scanned += 1;
    scanCredentials(file, content);
    scanClientEnvNames(file, content);
    scanClientImports(file, content);
  }
  console.log(`  scanned ${scanned} tracked files`);

  await scanBuiltBundles();

  if (findings.length === 0) {
    console.log('\n✓ No secrets, no client-exposed provider keys.');
    process.exit(0);
  }

  console.error(`\n✗ ${findings.length} finding(s):\n`);
  for (const finding of findings) {
    const where = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    console.error(`  [${finding.severity}] ${where}\n      ${finding.message}`);
  }
  console.error(
    '\nIf a finding is a false positive, narrow the pattern in infra/scripts/scan-secrets.mjs.\n' +
      'Never silence it by removing the check.\n',
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
