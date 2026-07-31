import type { FastifyInstance, FastifyRequest } from 'fastify';
import { LingoLiveError } from '@lingolive/contracts';
import type { AppContext } from '../context.js';
import { AuthService, type AuthenticatedActor } from '../modules/auth.js';
import { constantTimeEquals } from '../security/crypto.js';

declare module 'fastify' {
  interface FastifyRequest {
    actor: AuthenticatedActor | null;
  }
  interface FastifyInstance {
    /** Requires a valid access token (guest or account). */
    requireActor: (request: FastifyRequest) => Promise<AuthenticatedActor>;
    /** Requires an admin account AND the shared admin token. */
    requireAdmin: (request: FastifyRequest) => Promise<AuthenticatedActor>;
    /** Resolves an actor when present, without failing anonymous callers. */
    optionalActor: (request: FastifyRequest) => Promise<AuthenticatedActor | null>;
  }
}

export function registerAuth(app: FastifyInstance, context: AppContext): void {
  const auth = new AuthService(context);

  app.decorateRequest('actor', null);

  const resolve = async (request: FastifyRequest): Promise<AuthenticatedActor | null> => {
    if (request.actor) return request.actor;
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return null;
    const token = header.slice('Bearer '.length).trim();
    if (!token) return null;

    const claims = auth.verifyAccessToken(token);
    const actor = await auth.loadActor(claims);
    request.actor = actor;
    return actor;
  };

  app.decorate('optionalActor', async (request: FastifyRequest) => {
    try {
      return await resolve(request);
    } catch {
      // An invalid token on an optional route is treated as anonymous rather
      // than as an error — public endpoints must keep working.
      return null;
    }
  });

  app.decorate('requireActor', async (request: FastifyRequest) => {
    const actor = await resolve(request);
    if (!actor) {
      throw new LingoLiveError('UNAUTHORIZED', 'Authentication required');
    }
    return actor;
  });

  app.decorate('requireAdmin', async (request: FastifyRequest) => {
    const actor = await resolve(request);
    if (!actor) throw new LingoLiveError('UNAUTHORIZED', 'Authentication required');
    if (!actor.isAdmin) {
      // 404-equivalent semantics: a non-admin learns nothing about the surface.
      throw new LingoLiveError('FORBIDDEN', 'Administrator access required');
    }

    // Defence in depth: an admin session alone is not enough. A stolen admin
    // token cannot be used without also holding the deployment's shared
    // secret, which lives only in the operator's environment.
    const expected = context.env.ADMIN_API_TOKEN;
    if (expected) {
      const provided = request.headers['x-admin-token'];
      if (typeof provided !== 'string' || !constantTimeEquals(provided, expected)) {
        throw new LingoLiveError(
          'ADMIN_TOKEN_REQUIRED',
          'A valid X-Admin-Token header is required',
        );
      }
    } else if (context.derived.isStagingOrProduction) {
      throw new LingoLiveError(
        'ADMIN_TOKEN_REQUIRED',
        'The admin surface is disabled because ADMIN_API_TOKEN is not configured',
      );
    }

    return actor;
  });
}
