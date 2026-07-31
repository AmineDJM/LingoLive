import type { FastifyInstance } from 'fastify';
import {
  LingoLiveError,
  linkAccountRequestSchema,
  registerDeviceRequestSchema,
  type AuthTokenResponse,
} from '@lingolive/contracts';
import type { AppContext } from '../context.js';
import { AuthService } from '../modules/auth.js';
import { parseOrThrow } from '../plugins/errors.js';

export async function registerAuthRoutes(app: FastifyInstance, context: AppContext): Promise<void> {
  const auth = new AuthService(context);

  /**
   * Guest sign-in. This is the *only* thing a first-time user needs, and it
   * happens silently in the background — no screen, no form, no account.
   */
  app.post('/auth/guest', async (request): Promise<AuthTokenResponse> => {
    const body = parseOrThrow(registerDeviceRequestSchema, request.body);
    const { user, token, expiresAt } = await auth.registerGuest({
      anonymousId: body.anonymousId,
      platform: body.platform,
      ...(body.appVersion ? { appVersion: body.appVersion } : {}),
      ...(body.locale ? { locale: body.locale } : {}),
    });
    context.metrics.increment('auth.guest_registered');
    return {
      accessToken: token,
      refreshToken: null,
      expiresAt: expiresAt.toISOString(),
      user: await auth.describeUser(user.id),
    };
  });

  /**
   * Upgrades the caller's guest account to a real one, keeping their saved
   * transcripts. Requires an existing (guest) token, which is what makes the
   * carry-over possible.
   */
  app.post('/auth/link', async (request): Promise<AuthTokenResponse> => {
    // In `local` auth mode the adapter accepts a token this server itself
    // signed, so outside development anyone holding a guest token could claim
    // an identity. Refusing here is what lets the rest of the product deploy
    // with no identity provider at all — guest mode is unaffected.
    if (!context.derived.accountLinkingEnabled) {
      throw new LingoLiveError(
        'SERVICE_UNAVAILABLE',
        'Accounts are not enabled on this deployment. Everything works as a guest.',
      );
    }

    const actor = await app.requireActor(request);
    const body = parseOrThrow(linkAccountRequestSchema, request.body);
    const { user, token, expiresAt } = await auth.linkIdentity({
      currentUserId: actor.userId,
      identityToken: body.identityToken,
      provider: body.provider,
      ...(body.email ? { email: body.email } : {}),
    });
    context.metrics.increment('auth.account_linked');
    return {
      accessToken: token,
      refreshToken: null,
      expiresAt: expiresAt.toISOString(),
      user: await auth.describeUser(user.id),
    };
  });
}
