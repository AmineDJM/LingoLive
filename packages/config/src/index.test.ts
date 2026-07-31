import { describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  deriveConfig,
  isSecretKey,
  parseServerEnv,
  redactedConfig,
} from './index.js';

const base: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  APP_ENV: 'development',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  SESSION_SIGNING_SECRET: 'a'.repeat(40),
  TRANSCRIPT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

const prodBase: NodeJS.ProcessEnv = {
  ...base,
  NODE_ENV: 'production',
  APP_ENV: 'production',
  AI_PROVIDER: 'openai',
  OPENAI_API_KEY: 'sk-test-not-a-real-key',
  OPENAI_TRANSLATION_MODEL: 'some-current-text-model',
  AUTH_PROVIDER: 'oidc',
  AUTH_SECRET: 'b'.repeat(40),
  REDIS_URL: 'redis://localhost:6379',
  ADMIN_API_TOKEN: 'c'.repeat(32),
  APP_BASE_URL: 'https://lingolive.app',
  API_BASE_URL: 'https://api.lingolive.app',
  WEB_BASE_URL: 'https://lingolive.app',
  ENABLE_DEV_SIMULATOR: 'false',
};

describe('server env validation', () => {
  it('accepts a minimal development configuration', () => {
    const env = parseServerEnv(base);
    expect(env.AI_PROVIDER).toBe('mock');
    expect(env.PORT).toBe(4000);
    expect(env.MAX_DISCUSSION_LANGUAGES).toBe(4);
  });

  it('rejects a missing database URL', () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = base;
    expect(() => parseServerEnv(withoutDb)).toThrow(ConfigurationError);
  });

  it('rejects a short signing secret', () => {
    expect(() => parseServerEnv({ ...base, SESSION_SIGNING_SECRET: 'short' })).toThrow(
      /SESSION_SIGNING_SECRET/,
    );
  });

  it('rejects an encryption key that is not 32 raw bytes', () => {
    expect(() =>
      parseServerEnv({ ...base, TRANSCRIPT_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/TRANSCRIPT_ENCRYPTION_KEY/);
  });

  it('coerces numeric and boolean strings', () => {
    const env = parseServerEnv({
      ...base,
      PORT: '8080',
      FREE_MINUTES_PER_MONTH: '500',
      COST_CIRCUIT_BREAKER_ENABLED: 'false',
      ANALYTICS_ENABLED: 'yes',
    });
    expect(env.PORT).toBe(8080);
    expect(env.FREE_MINUTES_PER_MONTH).toBe(500);
    expect(env.COST_CIRCUIT_BREAKER_ENABLED).toBe(false);
    expect(env.ANALYTICS_ENABLED).toBe(true);
  });

  it('parses comma-separated lists', () => {
    const env = parseServerEnv({
      ...base,
      CORS_ALLOWED_ORIGINS: 'https://a.test, https://b.test ,',
      ADMIN_EMAILS: 'ops@lingolive.app',
    });
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
    expect(env.ADMIN_EMAILS).toEqual(['ops@lingolive.app']);
  });
});

describe('OpenAI provider requirements', () => {
  it('requires an API key', () => {
    expect(() => parseServerEnv({ ...base, AI_PROVIDER: 'openai' })).toThrow(/OPENAI_API_KEY/);
  });

  it('requires an explicitly chosen translation model — no hard-coded alias', () => {
    expect(() =>
      parseServerEnv({ ...base, AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-x' }),
    ).toThrow(/OPENAI_TRANSLATION_MODEL/);
  });

  it('keeps the transcription model configurable with the documented default', () => {
    const env = parseServerEnv(base);
    expect(env.OPENAI_TRANSCRIPTION_MODEL).toBe('gpt-live-transcribe');
    expect(
      parseServerEnv({ ...base, OPENAI_TRANSCRIPTION_MODEL: 'other-model' })
        .OPENAI_TRANSCRIPTION_MODEL,
    ).toBe('other-model');
  });
});

describe('production hardening', () => {
  it('accepts a complete production configuration', () => {
    const env = parseServerEnv(prodBase);
    expect(deriveConfig(env).isProduction).toBe(true);
  });

  it('refuses the mock AI provider in production', () => {
    expect(() => parseServerEnv({ ...prodBase, AI_PROVIDER: 'mock' })).toThrow(/AI_PROVIDER/);
  });

  it('refuses the dev simulator in production', () => {
    expect(() => parseServerEnv({ ...prodBase, ENABLE_DEV_SIMULATOR: 'true' })).toThrow(
      /ENABLE_DEV_SIMULATOR/,
    );
  });

  it('refuses local auth in production', () => {
    expect(() => parseServerEnv({ ...prodBase, AUTH_PROVIDER: 'local' })).toThrow(/AUTH_PROVIDER/);
  });

  it('refuses leftover development placeholder secrets', () => {
    expect(() =>
      parseServerEnv({ ...prodBase, SESSION_SIGNING_SECRET: 'dev-only-session-signing-secret-x' }),
    ).toThrow(/SESSION_SIGNING_SECRET/);
  });

  it('requires https base URLs', () => {
    expect(() => parseServerEnv({ ...prodBase, WEB_BASE_URL: 'http://lingolive.app' })).toThrow(
      /WEB_BASE_URL/,
    );
  });

  it('requires Redis', () => {
    const { REDIS_URL: _omitted, ...noRedis } = prodBase;
    expect(() => parseServerEnv(noRedis)).toThrow(/REDIS_URL/);
  });

  it('requires a strong admin token', () => {
    expect(() => parseServerEnv({ ...prodBase, ADMIN_API_TOKEN: 'short' })).toThrow(
      /ADMIN_API_TOKEN/,
    );
  });

  it('forces the dev simulator off even if derived in a prod-like env', () => {
    const env = parseServerEnv({ ...prodBase, APP_ENV: 'staging' });
    expect(deriveConfig(env).devSimulatorEnabled).toBe(false);
  });
});

describe('billing provider requirements', () => {
  it('requires a Stripe key when Stripe is selected', () => {
    expect(() => parseServerEnv({ ...base, BILLING_PROVIDER: 'stripe' })).toThrow(
      /STRIPE_SECRET_KEY/,
    );
  });

  it('requires at least one RevenueCat key', () => {
    expect(() => parseServerEnv({ ...base, BILLING_PROVIDER: 'revenuecat' })).toThrow(/REVENUECAT/);
  });

  it('defaults to the mock billing provider so the app runs without accounts', () => {
    expect(parseServerEnv(base).BILLING_PROVIDER).toBe('mock');
  });
});

describe('secret redaction', () => {
  it('classifies secret keys', () => {
    expect(isSecretKey('OPENAI_API_KEY')).toBe(true);
    expect(isSecretKey('SESSION_SIGNING_SECRET')).toBe(true);
    expect(isSecretKey('SOME_CUSTOM_TOKEN')).toBe(true);
    expect(isSecretKey('PORT')).toBe(false);
  });

  it('never emits a secret value', () => {
    const env = parseServerEnv(prodBase);
    const redacted = redactedConfig(env);
    const serialised = JSON.stringify(redacted);
    expect(serialised).not.toContain('sk-test-not-a-real-key');
    expect(serialised).not.toContain(env.SESSION_SIGNING_SECRET);
    expect(serialised).not.toContain(env.TRANSCRIPT_ENCRYPTION_KEY);
    expect(redacted.OPENAI_API_KEY).toBe('set');
    expect(redacted.PORT).toBe('4000');
  });
});

describe('derived configuration', () => {
  it('reports translation as available in mock mode', () => {
    expect(deriveConfig(parseServerEnv(base)).translationAvailable).toBe(true);
  });

  it('reports translation as available when OpenAI is fully configured', () => {
    expect(deriveConfig(parseServerEnv(prodBase)).translationAvailable).toBe(true);
  });
});
