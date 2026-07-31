import { z } from 'zod';

/**
 * @lingolive/config — one validated, typed view of the environment.
 *
 * Rules:
 *  - the process refuses to boot on an invalid configuration rather than
 *    failing later in a request;
 *  - production has stricter rules than development (no mock AI, no dev
 *    simulator, real secrets required);
 *  - nothing in here is ever logged verbatim — see `redactedConfig()`.
 */

const booleanFromEnv = z.union([z.boolean(), z.string()]).transform((value) => {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
});

const intFromEnv = (fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .union([z.number(), z.string()])
    .default(fallback)
    .transform((value) => {
      const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    })
    .pipe(z.number().int().min(min).max(max));

const floatFromEnv = (fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .union([z.number(), z.string()])
    .default(fallback)
    .transform((value) => {
      const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    })
    .pipe(z.number().min(min).max(max));

const optionalString = z
  .string()
  .transform((v) => (v.trim() === '' ? undefined : v.trim()))
  .optional();

const csv = (fallback: string[] = []) =>
  z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .transform((list) => (list.length > 0 ? list : fallback));

export const APP_ENVS = ['development', 'test', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(APP_ENVS).default('development'),
    // `silent` is a real pino level and is what the test harness uses.
    LOG_LEVEL: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
      .default('info'),
    PORT: intFromEnv(4000, 1, 65_535),
    HOST: z.string().default('0.0.0.0'),

    APP_BASE_URL: z.string().default('http://localhost:3000'),
    API_BASE_URL: z.string().default('http://localhost:4000'),
    WEB_BASE_URL: z.string().default('http://localhost:3000'),
    DEEP_LINK_SCHEME: z.string().default('lingolive'),
    CORS_ALLOWED_ORIGINS: csv(['http://localhost:3000']),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: optionalString,

    SESSION_SIGNING_SECRET: z.string().min(32, 'SESSION_SIGNING_SECRET must be ≥ 32 characters'),
    TRANSCRIPT_ENCRYPTION_KEY: z
      .string()
      .min(1, 'TRANSCRIPT_ENCRYPTION_KEY is required')
      .refine((value) => {
        try {
          return Buffer.from(value, 'base64').length === 32;
        } catch {
          return false;
        }
      }, 'TRANSCRIPT_ENCRYPTION_KEY must be 32 bytes, base64-encoded (see infra/scripts/generate-secrets.mjs)'),
    TRANSCRIPT_ENCRYPTION_KEY_VERSION: intFromEnv(1, 1),

    AI_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
    OPENAI_API_KEY: optionalString,
    OPENAI_TRANSCRIPTION_MODEL: z.string().default('gpt-live-transcribe'),
    /**
     * Deliberately has no default. Pinning a model alias in source code is how
     * a product silently breaks when the alias is retired — the deployer must
     * state which model is current for their account.
     */
    OPENAI_TRANSLATION_MODEL: optionalString,
    OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
    OPENAI_REALTIME_URL: z.string().default('https://api.openai.com/v1/realtime'),
    REALTIME_TOKEN_TTL_SECONDS: intFromEnv(60, 10, 600),

    AUTH_PROVIDER: z.enum(['local', 'oidc']).default('local'),
    AUTH_SECRET: z.string().min(16).default('dev-only-auth-secret-change-me-please-32c'),
    AUTH_PUBLIC_KEY: optionalString,
    AUTH_ISSUER: optionalString,
    AUTH_AUDIENCE: z.string().default('lingolive'),
    AUTH_JWKS_URL: optionalString,
    ACCESS_TOKEN_TTL_SECONDS: intFromEnv(3600, 60, 86_400),
    REFRESH_TOKEN_TTL_SECONDS: intFromEnv(2_592_000, 3600),

    ADMIN_EMAILS: csv([]),
    ADMIN_API_TOKEN: optionalString,

    GUEST_MINUTES_PER_MONTH: intFromEnv(30, 0),
    FREE_MINUTES_PER_MONTH: intFromEnv(120, 0),
    PRO_MINUTES_PER_MONTH: intFromEnv(6000, 0),
    MAX_PERSONAL_SESSION_MINUTES: intFromEnv(180, 1),
    MAX_DISCUSSION_LANGUAGES: intFromEnv(4, 2, 4),
    MAX_BUSINESS_TARGET_LANGUAGES: intFromEnv(12, 1, 50),
    SESSION_IDLE_TIMEOUT_SECONDS: intFromEnv(180, 30),
    DAILY_COST_LIMIT_USD: floatFromEnv(50, 0),
    MONTHLY_COST_LIMIT_USD: floatFromEnv(800, 0),
    COST_CIRCUIT_BREAKER_ENABLED: booleanFromEnv.default(true),

    RETENTION_UNSAVED_SESSION_HOURS: intFromEnv(1, 0),
    RETENTION_BUSINESS_SESSION_DAYS: intFromEnv(7, 0),
    RETENTION_TECHNICAL_LOG_DAYS: intFromEnv(30, 1),
    BUSINESS_CODE_TTL_HOURS: intFromEnv(24, 1, 168),

    SENTRY_DSN: optionalString,
    SENTRY_ENVIRONMENT: optionalString,
    SENTRY_TRACES_SAMPLE_RATE: floatFromEnv(0.1, 0, 1),
    POSTHOG_KEY: optionalString,
    POSTHOG_HOST: optionalString,
    ANALYTICS_ENABLED: booleanFromEnv.default(false),

    BILLING_PROVIDER: z.enum(['mock', 'stripe', 'revenuecat']).default('mock'),
    REVENUECAT_IOS_API_KEY: optionalString,
    REVENUECAT_ANDROID_API_KEY: optionalString,
    REVENUECAT_WEBHOOK_SECRET: optionalString,
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    STRIPE_PRO_PRICE_ID: optionalString,

    ENABLE_DEV_SIMULATOR: booleanFromEnv.default(false),
    ENABLE_REQUEST_LOGGING: booleanFromEnv.default(true),

    APP_DISPLAY_NAME: z.string().default('LingoLive'),
    IOS_BUNDLE_IDENTIFIER: z.string().default('com.lingolive.app'),
    ANDROID_PACKAGE: z.string().default('com.lingolive.app'),
  })
  .superRefine((env, ctx) => {
    const isProdLike = env.APP_ENV === 'production' || env.APP_ENV === 'staging';

    if (env.AI_PROVIDER === 'openai') {
      if (!env.OPENAI_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['OPENAI_API_KEY'],
          message: 'OPENAI_API_KEY is required when AI_PROVIDER=openai',
        });
      }
      if (!env.OPENAI_TRANSLATION_MODEL) {
        ctx.addIssue({
          code: 'custom',
          path: ['OPENAI_TRANSLATION_MODEL'],
          message:
            'OPENAI_TRANSLATION_MODEL is required when AI_PROVIDER=openai. It must be a TEXT/chat model — translation is a /chat/completions call with JSON mode, not a realtime or speech-to-speech model. Set the identifier that is current and stable for your account.',
        });
      }
    }

    if (isProdLike) {
      if (env.AI_PROVIDER === 'mock') {
        ctx.addIssue({
          code: 'custom',
          path: ['AI_PROVIDER'],
          message: 'AI_PROVIDER=mock is not allowed in staging or production',
        });
      }
      if (env.ENABLE_DEV_SIMULATOR) {
        ctx.addIssue({
          code: 'custom',
          path: ['ENABLE_DEV_SIMULATOR'],
          message: 'ENABLE_DEV_SIMULATOR must be false in staging and production',
        });
      }
      if (env.AUTH_PROVIDER === 'local') {
        ctx.addIssue({
          code: 'custom',
          path: ['AUTH_PROVIDER'],
          message: 'AUTH_PROVIDER=local is a development-only mode',
        });
      }
      if (!env.REDIS_URL) {
        ctx.addIssue({
          code: 'custom',
          path: ['REDIS_URL'],
          message: 'REDIS_URL is required outside development (realtime fan-out and rate limits)',
        });
      }
      if (!env.ADMIN_API_TOKEN || env.ADMIN_API_TOKEN.length < 24) {
        ctx.addIssue({
          code: 'custom',
          path: ['ADMIN_API_TOKEN'],
          message: 'ADMIN_API_TOKEN must be set to at least 24 characters outside development',
        });
      }
      for (const [key, value] of [
        ['SESSION_SIGNING_SECRET', env.SESSION_SIGNING_SECRET],
        ['AUTH_SECRET', env.AUTH_SECRET],
        ['TRANSCRIPT_ENCRYPTION_KEY', env.TRANSCRIPT_ENCRYPTION_KEY],
      ] as const) {
        if (value.toLowerCase().includes('dev-only') || value.toLowerCase().includes('change-me')) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} still holds a development placeholder value`,
          });
        }
      }
      for (const [key, value] of [
        ['APP_BASE_URL', env.APP_BASE_URL],
        ['API_BASE_URL', env.API_BASE_URL],
        ['WEB_BASE_URL', env.WEB_BASE_URL],
      ] as const) {
        if (!value.startsWith('https://')) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} must use https:// outside development`,
          });
        }
      }
    }

    if (env.BILLING_PROVIDER === 'stripe' && !env.STRIPE_SECRET_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['STRIPE_SECRET_KEY'],
        message: 'STRIPE_SECRET_KEY is required when BILLING_PROVIDER=stripe',
      });
    }
    if (
      env.BILLING_PROVIDER === 'revenuecat' &&
      !env.REVENUECAT_IOS_API_KEY &&
      !env.REVENUECAT_ANDROID_API_KEY
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['REVENUECAT_IOS_API_KEY'],
        message:
          'At least one RevenueCat platform key is required when BILLING_PROVIDER=revenuecat',
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class ConfigurationError extends Error {
  readonly issues: Array<{ path: string; message: string }>;
  constructor(issues: Array<{ path: string; message: string }>) {
    const detail = issues.map((i) => `  • ${i.path}: ${i.message}`).join('\n');
    super(`Invalid LingoLive configuration:\n${detail}\n\nSee .env.example for the full template.`);
    this.name = 'ConfigurationError';
    this.issues = issues;
  }
}

export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigurationError(
      result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    );
  }
  return result.data;
}

/** Keys whose values must never appear in a log line, an error or the admin UI. */
export const SECRET_ENV_KEYS: readonly string[] = [
  'DATABASE_URL',
  'REDIS_URL',
  'SESSION_SIGNING_SECRET',
  'TRANSCRIPT_ENCRYPTION_KEY',
  'OPENAI_API_KEY',
  'AUTH_SECRET',
  'AUTH_PUBLIC_KEY',
  'ADMIN_API_TOKEN',
  'SENTRY_DSN',
  'POSTHOG_KEY',
  'REVENUECAT_IOS_API_KEY',
  'REVENUECAT_ANDROID_API_KEY',
  'REVENUECAT_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

export function isSecretKey(key: string): boolean {
  if (SECRET_ENV_KEYS.includes(key)) return true;
  return /(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|DSN)$/i.test(key);
}

/**
 * A version of the configuration that is safe to print, log, ship to the admin
 * console or attach to an error report. Secrets become `set` / `not set`.
 */
export function redactedConfig(env: ServerEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (isSecretKey(key)) {
      out[key] = value ? 'set' : 'not set';
      continue;
    }
    out[key] = Array.isArray(value) ? value.join(',') : String(value ?? '');
  }
  return out;
}

export interface DerivedConfig {
  readonly isProduction: boolean;
  readonly isStagingOrProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
  readonly translationAvailable: boolean;
  readonly transcriptionAvailable: boolean;
  readonly redisEnabled: boolean;
  readonly devSimulatorEnabled: boolean;
  readonly adminEmails: readonly string[];
}

export function deriveConfig(env: ServerEnv): DerivedConfig {
  const isProduction = env.APP_ENV === 'production';
  const isStagingOrProduction = isProduction || env.APP_ENV === 'staging';
  return {
    isProduction,
    isStagingOrProduction,
    isDevelopment: env.APP_ENV === 'development',
    isTest: env.APP_ENV === 'test' || env.NODE_ENV === 'test',
    translationAvailable:
      env.AI_PROVIDER === 'mock' || Boolean(env.OPENAI_API_KEY && env.OPENAI_TRANSLATION_MODEL),
    transcriptionAvailable: env.AI_PROVIDER === 'mock' || Boolean(env.OPENAI_API_KEY),
    redisEnabled: Boolean(env.REDIS_URL),
    // Belt and braces: the schema already forbids this in prod-like envs.
    devSimulatorEnabled: env.ENABLE_DEV_SIMULATOR && !isStagingOrProduction,
    adminEmails: env.ADMIN_EMAILS.map((e) => e.toLowerCase()),
  };
}

/** Quota minutes for a plan, straight from configuration. */
export function planMinutes(env: ServerEnv, plan: string): number {
  switch (plan) {
    case 'GUEST':
      return env.GUEST_MINUTES_PER_MONTH;
    case 'FREE':
      return env.FREE_MINUTES_PER_MONTH;
    case 'PRO':
      return env.PRO_MINUTES_PER_MONTH;
    case 'BUSINESS_PARTICIPANT':
      // Joining a LingoBusiness room never consumes personal quota.
      return Number.MAX_SAFE_INTEGER;
    default:
      return env.GUEST_MINUTES_PER_MONTH;
  }
}
