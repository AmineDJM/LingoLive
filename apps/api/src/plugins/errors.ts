import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type z } from 'zod';
import {
  httpStatusForErrorCode,
  LingoLiveError,
  type ApiErrorCode,
  type ApiErrorResponse,
} from '@lingolive/contracts';
import { scrubForLog } from '@lingolive/logging';
import type { AppContext } from '../context.js';

/**
 * The single place an error becomes a response.
 *
 * Guarantees, asserted by tests:
 *  - the body is always `{ error: { code, message, requestId } }`;
 *  - a 5xx never leaks a stack trace, a query, a prompt or a transcript;
 *  - every failure is correlated with a `requestId` the user can quote.
 */
export function registerErrorHandler(app: FastifyInstance, context: AppContext): void {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    const route = request.routeOptions?.url ?? request.url;

    const { code, status, message, details } = classify(error, context.derived.isProduction);

    context.metrics.recordError({ requestId, code, route, message });
    context.metrics.recordHttp(request.method, route, 0, status);

    const logPayload = {
      requestId,
      route,
      method: request.method,
      status,
      code,
      // `scrubForLog` guarantees no transcript or credential reaches the sink,
      // even if a new error type starts carrying one.
      err: scrubForLog(error),
    };
    if (status >= 500) {
      request.log.error(logPayload, 'Request failed');
      void persistError(context, {
        requestId,
        code,
        route,
        method: request.method,
        status,
        message,
      });
      // Optional, and structurally unable to carry request content: only the
      // exception type, a scrubbed message and enum tags leave the process.
      context.errorReporter.captureException(error, {
        requestId,
        route,
        ...(request.actor ? { role: request.actor.isGuest ? 'guest' : request.actor.plan } : {}),
        tags: { method: request.method, code },
      });
    } else {
      request.log.warn(logPayload, 'Request rejected');
    }

    const body: ApiErrorResponse = {
      error: { code, message, requestId, ...(details ? { details } : {}) },
    };
    void reply.status(status).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body: ApiErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
      },
    };
    void reply.status(404).send(body);
  });
}

interface Classified {
  code: ApiErrorCode;
  status: number;
  message: string;
  details?: Record<string, unknown>;
}

function classify(error: unknown, isProduction: boolean): Classified {
  if (error instanceof LingoLiveError) {
    return {
      code: error.code,
      status: error.status,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }

  if (error instanceof ZodError) {
    return {
      code: 'VALIDATION_FAILED',
      status: 422,
      message: 'Request validation failed',
      details: { issues: formatZodIssues(error) },
    };
  }

  const fastifyError = error as { statusCode?: number; code?: string; message?: string };

  if (fastifyError.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || fastifyError.statusCode === 413) {
    return { code: 'PAYLOAD_TOO_LARGE', status: 413, message: 'Request body too large' };
  }
  if (fastifyError.statusCode === 429) {
    return { code: 'RATE_LIMITED', status: 429, message: 'Too many requests' };
  }
  if (fastifyError.statusCode && fastifyError.statusCode < 500) {
    return {
      code: 'BAD_REQUEST',
      status: fastifyError.statusCode,
      message: fastifyError.message ?? 'Bad request',
    };
  }

  // Anything unrecognised is a 500 with a generic message. The real detail is
  // in the log line, keyed by requestId.
  return {
    code: 'INTERNAL_ERROR',
    status: 500,
    message: isProduction
      ? 'An unexpected error occurred'
      : (fastifyError.message ?? 'An unexpected error occurred'),
  };
}

export function formatZodIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

async function persistError(
  context: AppContext,
  input: {
    requestId: string;
    code: string;
    route: string | null;
    method: string;
    status: number;
    message: string;
  },
): Promise<void> {
  try {
    await context.prisma.errorEvent.create({
      data: {
        requestId: input.requestId,
        code: input.code,
        route: input.route,
        method: input.method,
        status: input.status,
        message: input.message.slice(0, 500),
      },
    });
  } catch {
    // Never let error bookkeeping cause a second failure.
  }
}

/**
 * Validation helper used by every route.
 *
 * Fastify's schema support is JSON-Schema-based; parsing with the same Zod
 * schemas the clients use guarantees there is exactly one definition of every
 * request shape in the product.
 */
export function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new LingoLiveError('VALIDATION_FAILED', 'Request validation failed', {
      status: httpStatusForErrorCode('VALIDATION_FAILED'),
      details: { issues: formatZodIssues(result.error) },
    });
  }
  return result.data;
}

export type { FastifyReply, FastifyRequest };
