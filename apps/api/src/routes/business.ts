import type { FastifyInstance } from 'fastify';
import {
  businessJoinRequestSchema,
  LingoLiveError,
  ORIGINAL_LANGUAGE,
  setViewerLanguageRequestSchema,
  type BusinessJoinResponse,
  type BusinessSessionPreview,
} from '@lingolive/contracts';
import type { AppContext } from '../context.js';
import { BusinessService } from '../modules/business.js';
import { CodeAttemptGuard } from '../modules/code-guard.js';
import { parseOrThrow } from '../plugins/errors.js';

/**
 * The LingoBusiness participant surface.
 *
 * Every route here is deliberately unauthenticated: a participant must be able
 * to scan a code and start reading. Requiring an account to attend a talk
 * someone invited you to would be the wrong product.
 */
export async function registerBusinessRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  const business = new BusinessService(context);
  // Guards against code *guessing* without throttling legitimate joins — see
  // modules/code-guard.ts for why a flat IP limit is the wrong tool here.
  const codeGuard = new CodeAttemptGuard();
  const guardKey = (request: { ip: string }) => `ip:${request.ip}`;

  /** Resolve a code to a room preview, before committing to join. */
  app.get(
    '/business/sessions/:code',
    {
      config: {
        // Read-only lookup; the failure guard below does the real work.
        rateLimit: { max: 60, timeWindow: '1 minute' },
      },
    },
    async (request): Promise<{ session: BusinessSessionPreview }> => {
      const { code } = request.params as { code: string };
      const key = guardKey(request);
      if (codeGuard.isBlocked(key)) {
        throw new LingoLiveError('RATE_LIMITED', 'Too many invalid codes; try again later');
      }
      try {
        const session = await business.preview(code);
        codeGuard.recordSuccess(key);
        return { session };
      } catch (error) {
        if (isCodeFailure(error)) codeGuard.recordFailure(key);
        throw error;
      }
    },
  );

  app.post(
    '/business/join',
    {
      config: {
        // Generous on purpose: a conference hall behind one NAT address must
        // be able to join all at once. Guessing is throttled by failures.
        rateLimit: { max: 600, timeWindow: '1 minute' },
      },
    },
    async (request): Promise<BusinessJoinResponse> => {
      const body = parseOrThrow(businessJoinRequestSchema, request.body);
      // An account is optional: if the caller happens to have a token we
      // associate the participation, otherwise they join as a guest.
      const actor = await app.optionalActor(request);

      const key = guardKey(request);
      if (codeGuard.isBlocked(key)) {
        throw new LingoLiveError('RATE_LIMITED', 'Too many invalid codes; try again later');
      }

      let result;
      try {
        result = await business.join({
          ...(body.code ? { code: body.code } : {}),
          ...(body.joinToken ? { joinToken: body.joinToken } : {}),
          targetLanguage:
            body.targetLanguage === ORIGINAL_LANGUAGE ? ORIGINAL_LANGUAGE : body.targetLanguage,
          ...(body.anonymousId ? { anonymousId: body.anonymousId } : {}),
          ...(body.displayName ? { displayName: body.displayName } : {}),
          userId: actor?.userId ?? null,
        });
      } catch (error) {
        if (isCodeFailure(error)) codeGuard.recordFailure(key);
        throw error;
      }
      codeGuard.recordSuccess(key);

      return {
        session: result.session,
        participantId: result.participantId,
        realtimeToken: result.realtimeToken,
        realtimeUrl: realtimeUrl(context),
        targetLanguage: result.targetLanguage,
        requiresAccount: false,
      };
    },
  );

  /** Change reading language mid-session, without rejoining. */
  app.post('/business/sessions/:id/language', async (request) => {
    const { id } = request.params as { id: string };
    const body = parseOrThrow(setViewerLanguageRequestSchema, request.body);
    const targetLanguage = await business.setViewerLanguage(
      id,
      body.participantId,
      body.targetLanguage,
    );
    return { targetLanguage };
  });
}

/** Only a wrong or expired code counts as a guess; a full room does not. */
function isCodeFailure(error: unknown): boolean {
  return (
    error instanceof LingoLiveError &&
    (error.code === 'INVALID_ACCESS_CODE' || error.code === 'ACCESS_CODE_EXPIRED')
  );
}

function realtimeUrl(context: AppContext): string {
  const base = context.env.API_BASE_URL.replace(/^http/, 'ws').replace(/\/$/, '');
  return `${base}/realtime`;
}
