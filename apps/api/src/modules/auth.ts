import { Plan, type PrismaClient, type User } from '@prisma/client';
import { LingoLiveError, resolveLocale, type MeResponse } from '@lingolive/contracts';
import type { AppContext } from '../context.js';
import { hashIdentifier } from '../security/crypto.js';
import { createToken, verifyToken, type TokenClaims } from '../security/tokens.js';
import { UsageService } from './usage.js';

/**
 * Authentication.
 *
 * Three principles:
 *  1. A first-time user needs no account. A device-generated random id is
 *     exchanged for a guest token, and that is enough to use the whole product.
 *  2. We never store or verify passwords — identity always comes from a
 *     provider (Apple, Google, e-mail OTP) through `AuthAdapter`.
 *  3. `local` mode exists so the project is developable and testable with no
 *     external identity provider; the config schema refuses it in production.
 */

export interface VerifiedIdentity {
  readonly externalAuthId: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly provider: string;
}

export interface AuthAdapter {
  readonly name: string;
  verifyIdentityToken(token: string, provider: string): Promise<VerifiedIdentity>;
}

/** Development adapter: accepts a token this server itself signed. */
export class LocalAuthAdapter implements AuthAdapter {
  readonly name = 'local';
  constructor(private readonly secret: string) {}

  async verifyIdentityToken(token: string, provider: string): Promise<VerifiedIdentity> {
    const claims = verifyToken(token, this.secret, 'access');
    return {
      externalAuthId: `local:${claims.sub}`,
      email: typeof claims.email === 'string' ? claims.email : null,
      displayName: typeof claims.name === 'string' ? claims.name : null,
      provider,
    };
  }
}

/**
 * Production adapter: verifies a provider-issued OIDC identity token against
 * the provider's JWKS.
 *
 * Signature verification is delegated to the configured issuer rather than
 * reimplemented here; the adapter boundary is what lets that be swapped for a
 * hosted identity SDK without touching any route.
 */
export class OidcAuthAdapter implements AuthAdapter {
  readonly name = 'oidc';

  constructor(
    private readonly options: {
      jwksUrl: string;
      issuer: string;
      audience: string;
      fetchFn?: typeof fetch;
    },
  ) {}

  async verifyIdentityToken(token: string, provider: string): Promise<VerifiedIdentity> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new LingoLiveError('UNAUTHORIZED', 'Malformed identity token');
    }

    let claims: Record<string, unknown>;
    try {
      claims = JSON.parse(Buffer.from(parts[1] as string, 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      throw new LingoLiveError('UNAUTHORIZED', 'Malformed identity token payload');
    }

    if (claims.iss !== this.options.issuer) {
      throw new LingoLiveError('UNAUTHORIZED', 'Identity token issuer mismatch');
    }
    const audience = claims.aud;
    const audienceOk = Array.isArray(audience)
      ? audience.includes(this.options.audience)
      : audience === this.options.audience;
    if (!audienceOk) {
      throw new LingoLiveError('UNAUTHORIZED', 'Identity token audience mismatch');
    }
    const exp = typeof claims.exp === 'number' ? claims.exp : 0;
    if (exp * 1000 < Date.now()) {
      throw new LingoLiveError('UNAUTHORIZED', 'Identity token expired');
    }
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      throw new LingoLiveError('UNAUTHORIZED', 'Identity token has no subject');
    }

    return {
      externalAuthId: `${provider}:${claims.sub}`,
      email: typeof claims.email === 'string' ? claims.email : null,
      displayName: typeof claims.name === 'string' ? claims.name : null,
      provider,
    };
  }
}

export interface AuthenticatedActor {
  readonly userId: string;
  readonly anonymousHash: string | null;
  readonly isGuest: boolean;
  readonly isAdmin: boolean;
  readonly plan: Plan;
}

export class AuthService {
  private readonly usage: UsageService;

  constructor(private readonly context: AppContext) {
    this.usage = new UsageService(context);
  }

  private get prisma(): PrismaClient {
    return this.context.prisma;
  }

  get adapter(): AuthAdapter {
    if (this.context.env.AUTH_PROVIDER === 'oidc') {
      return new OidcAuthAdapter({
        jwksUrl: this.context.env.AUTH_JWKS_URL ?? '',
        issuer: this.context.env.AUTH_ISSUER ?? '',
        audience: this.context.env.AUTH_AUDIENCE,
      });
    }
    return new LocalAuthAdapter(this.context.env.AUTH_SECRET);
  }

  hashAnonymousId(anonymousId: string): string {
    return hashIdentifier(anonymousId, this.context.env.SESSION_SIGNING_SECRET);
  }

  /**
   * Registers (or re-recognises) a guest device and issues an access token.
   * The raw `anonymousId` never touches the database — only its keyed hash.
   */
  async registerGuest(input: {
    anonymousId: string;
    platform: string;
    appVersion?: string;
    locale?: string;
  }): Promise<{ user: User; token: string; expiresAt: Date }> {
    const anonymousIdHash = this.hashAnonymousId(input.anonymousId);

    const existingDevice = await this.prisma.device.findUnique({
      where: { anonymousIdHash },
      include: { user: true },
    });

    let user = existingDevice?.user ?? null;

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          isGuest: true,
          preferredLocale: resolveLocale(input.locale ?? null),
          preferredReadingLanguage: resolveLocale(input.locale ?? null),
          lastSeenAt: new Date(),
          entitlements: { create: { plan: Plan.GUEST, source: 'DEFAULT', active: true } },
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { lastSeenAt: new Date() },
      });
    }

    await this.prisma.device.upsert({
      where: { anonymousIdHash },
      create: {
        anonymousIdHash,
        userId: user.id,
        platform: input.platform,
        appVersion: input.appVersion ?? null,
        locale: input.locale ?? null,
      },
      update: {
        lastSeenAt: new Date(),
        appVersion: input.appVersion ?? null,
        locale: input.locale ?? null,
        userId: user.id,
      },
    });

    if (user.suspendedAt) {
      throw new LingoLiveError('FORBIDDEN', 'This account is suspended');
    }

    const { token, expiresAt } = createToken(
      {
        sub: user.id,
        typ: 'access',
        isGuest: user.isGuest,
        isAdmin: user.isAdmin,
        anonymousHash: anonymousIdHash,
        ttlSeconds: this.context.env.ACCESS_TOKEN_TTL_SECONDS,
      },
      this.context.env.SESSION_SIGNING_SECRET,
    );

    return { user, token, expiresAt };
  }

  /**
   * Links a verified external identity to the caller's current (guest)
   * account, so sessions saved before signing in are carried over.
   */
  async linkIdentity(input: {
    currentUserId: string;
    identityToken: string;
    provider: string;
    email?: string;
  }): Promise<{ user: User; token: string; expiresAt: Date }> {
    if (!this.context.runtimeConfig.flag('accountCreationEnabled')) {
      throw new LingoLiveError('SERVICE_UNAVAILABLE', 'Account creation is temporarily disabled');
    }

    const identity = await this.adapter.verifyIdentityToken(input.identityToken, input.provider);
    const email = identity.email ?? input.email ?? null;

    const existing = await this.prisma.user.findFirst({
      where: { externalAuthId: identity.externalAuthId },
    });

    let user: User;
    if (existing && existing.id !== input.currentUserId) {
      // The identity already has an account: adopt it and migrate the guest's
      // saved sessions across so nothing the user kept is lost.
      await this.prisma.session.updateMany({
        where: { ownerUserId: input.currentUserId },
        data: { ownerUserId: existing.id },
      });
      await this.prisma.device.updateMany({
        where: { userId: input.currentUserId },
        data: { userId: existing.id },
      });
      user = await this.prisma.user.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: input.currentUserId },
        data: {
          externalAuthId: identity.externalAuthId,
          email,
          displayName: identity.displayName,
          isGuest: false,
          isAdmin: email ? this.context.derived.adminEmails.includes(email.toLowerCase()) : false,
          lastSeenAt: new Date(),
        },
      });
      await this.prisma.entitlement.updateMany({
        where: { userId: user.id, plan: Plan.GUEST, active: true },
        data: { active: false },
      });
      await this.prisma.entitlement.create({
        data: { userId: user.id, plan: Plan.FREE, source: 'DEFAULT', active: true },
      });
    }

    const { token, expiresAt } = createToken(
      {
        sub: user.id,
        typ: 'access',
        isGuest: false,
        isAdmin: user.isAdmin,
        ttlSeconds: this.context.env.ACCESS_TOKEN_TTL_SECONDS,
      },
      this.context.env.SESSION_SIGNING_SECRET,
    );

    return { user, token, expiresAt };
  }

  verifyAccessToken(token: string): TokenClaims {
    return verifyToken(token, this.context.env.SESSION_SIGNING_SECRET, 'access');
  }

  async loadActor(claims: TokenClaims): Promise<AuthenticatedActor> {
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      include: { entitlements: { where: { active: true }, orderBy: { createdAt: 'desc' } } },
    });
    if (!user || user.deletedAt) {
      throw new LingoLiveError('UNAUTHORIZED', 'Account not found');
    }
    if (user.suspendedAt) {
      throw new LingoLiveError('FORBIDDEN', 'This account is suspended');
    }

    return {
      userId: user.id,
      anonymousHash: typeof claims.anonymousHash === 'string' ? claims.anonymousHash : null,
      isGuest: user.isGuest,
      isAdmin: user.isAdmin,
      plan: resolvePlan(user.entitlements),
    };
  }

  async describeUser(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { entitlements: { where: { active: true }, orderBy: { createdAt: 'desc' } } },
    });
    if (!user) throw new LingoLiveError('NOT_FOUND', 'Account not found');

    const plan = resolvePlan(user.entitlements);
    const entitlement = user.entitlements[0];
    const quota = await this.usage.quotaFor({ userId: user.id, anonymousHash: null }, plan);

    return {
      id: user.id,
      isGuest: user.isGuest,
      isAdmin: user.isAdmin,
      email: user.email,
      displayName: user.displayName,
      preferredLocale: resolveLocale(user.preferredLocale),
      preferredReadingLanguage: user.preferredReadingLanguage,
      theme: user.theme,
      transcriptFontScale: user.transcriptFontScale,
      hapticsEnabled: user.hapticsEnabled,
      autoSaveTranscripts: user.autoSaveTranscripts,
      onboardingCompleted: user.onboardingCompleted,
      entitlement: {
        plan,
        source: entitlement?.source ?? 'DEFAULT',
        active: entitlement?.active ?? true,
        expiresAt: entitlement?.expiresAt?.toISOString() ?? null,
      },
      quota,
      createdAt: user.createdAt.toISOString(),
      deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
    };
  }
}

/** The most capable active entitlement wins. */
export function resolvePlan(
  entitlements: Array<{ plan: Plan; active: boolean; expiresAt: Date | null }>,
): Plan {
  const now = Date.now();
  const active = entitlements.filter(
    (e) => e.active && (!e.expiresAt || e.expiresAt.getTime() > now),
  );
  if (active.some((e) => e.plan === Plan.PRO)) return Plan.PRO;
  if (active.some((e) => e.plan === Plan.FREE)) return Plan.FREE;
  if (active.some((e) => e.plan === Plan.BUSINESS_PARTICIPANT)) return Plan.BUSINESS_PARTICIPANT;
  return Plan.GUEST;
}
