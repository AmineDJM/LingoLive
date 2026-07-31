#!/usr/bin/env node
/**
 * Generates cryptographically strong values for the secrets LingoLive requires.
 * Nothing is written to disk — copy what you need into your secret store.
 */
import { randomBytes } from 'node:crypto';

const secrets = {
  SESSION_SIGNING_SECRET: randomBytes(48).toString('base64url'),
  AUTH_SECRET: randomBytes(48).toString('base64url'),
  ADMIN_API_TOKEN: randomBytes(32).toString('base64url'),
  // AES-256-GCM requires exactly 32 raw bytes.
  TRANSCRIPT_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
};

console.log('# Generated %s — store these in your secret manager, never in git.', new Date().toISOString());
for (const [key, value] of Object.entries(secrets)) {
  console.log(`${key}=${value}`);
}
console.log('TRANSCRIPT_ENCRYPTION_KEY_VERSION=1');
