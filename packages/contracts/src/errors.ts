import { z } from 'zod';

/**
 * Every failure the API can return has a stable machine-readable `code`.
 * Clients map codes to localised copy; they never parse `message`.
 */
export const API_ERROR_CODES = [
  // Request-level
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  'UPSTREAM_TIMEOUT',
  // Session lifecycle
  'SESSION_NOT_FOUND',
  'SESSION_ALREADY_ENDED',
  'SESSION_EXPIRED',
  'SESSION_LIMIT_REACHED',
  'SESSION_MAX_DURATION_REACHED',
  // Business join
  'INVALID_ACCESS_CODE',
  'ACCESS_CODE_EXPIRED',
  'SESSION_FULL',
  // Entitlements / cost
  'QUOTA_EXCEEDED',
  'PLAN_REQUIRED',
  'COST_LIMIT_REACHED',
  // AI providers
  'AI_PROVIDER_UNAVAILABLE',
  'AI_PROVIDER_NOT_CONFIGURED',
  'TRANSLATION_FAILED',
  'TRANSCRIPTION_FAILED',
  'UNSUPPORTED_LANGUAGE',
  // Realtime
  'REALTIME_TOKEN_INVALID',
  'REALTIME_TOKEN_EXPIRED',
  'REALTIME_TOKEN_ALREADY_USED',
  'REALTIME_CONNECTION_FAILED',
  // Account
  'ACCOUNT_DELETION_IN_PROGRESS',
  'ADMIN_TOKEN_REQUIRED',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const apiErrorSchema = z.object({
  code: z.enum(API_ERROR_CODES),
  /**
   * Developer-facing English summary. Never contains transcript content,
   * tokens, prompts or audio. Clients must localise from `code`.
   */
  message: z.string(),
  /** Correlates the client failure with the exact server log line. */
  requestId: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiErrorResponseSchema = z.object({ error: apiErrorSchema });
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

const DEFAULT_STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  UPSTREAM_TIMEOUT: 504,
  SESSION_NOT_FOUND: 404,
  SESSION_ALREADY_ENDED: 409,
  SESSION_EXPIRED: 410,
  SESSION_LIMIT_REACHED: 429,
  SESSION_MAX_DURATION_REACHED: 409,
  INVALID_ACCESS_CODE: 404,
  ACCESS_CODE_EXPIRED: 410,
  SESSION_FULL: 409,
  QUOTA_EXCEEDED: 402,
  PLAN_REQUIRED: 402,
  COST_LIMIT_REACHED: 503,
  AI_PROVIDER_UNAVAILABLE: 503,
  AI_PROVIDER_NOT_CONFIGURED: 501,
  TRANSLATION_FAILED: 502,
  TRANSCRIPTION_FAILED: 502,
  UNSUPPORTED_LANGUAGE: 422,
  REALTIME_TOKEN_INVALID: 401,
  REALTIME_TOKEN_EXPIRED: 401,
  REALTIME_TOKEN_ALREADY_USED: 409,
  REALTIME_CONNECTION_FAILED: 502,
  ACCOUNT_DELETION_IN_PROGRESS: 409,
  ADMIN_TOKEN_REQUIRED: 401,
};

export function httpStatusForErrorCode(code: ApiErrorCode): number {
  return DEFAULT_STATUS[code] ?? 500;
}

/**
 * Thrown by API modules. The error plugin turns it into an `ApiErrorResponse`
 * and guarantees no stack trace or internal detail leaks in production.
 */
export class LingoLiveError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;
  /** `true` when the message is safe to show verbatim in developer tooling. */
  readonly expose: boolean;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: { status?: number; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'LingoLiveError';
    this.code = code;
    this.status = options.status ?? httpStatusForErrorCode(code);
    this.details = options.details;
    this.expose = this.status < 500;
  }
}
