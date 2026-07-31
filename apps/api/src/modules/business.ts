import { ParticipantRole, SessionKind, SessionStatus, type PrismaClient } from '@prisma/client';
import {
  LingoLiveError,
  normalizeAccessCode,
  normalizeLanguageTag,
  type BusinessSessionPreview,
} from '@lingolive/contracts';
import { buildJoinDeepLink, buildJoinUrl } from '@lingolive/realtime-core';
import type { AppContext } from '../context.js';
import { generateAccessCode, hashIdentifier } from '../security/crypto.js';
import { createToken, verifyToken } from '../security/tokens.js';

/**
 * LingoBusiness — participant side.
 *
 * The organizer dashboard is explicitly out of scope for this build; what is
 * built in full is everything a participant touches: resolve a code or link,
 * pick a reading language, join with no account, receive the live translated
 * transcript, and reconnect without gaps.
 *
 * `createBusinessSession` exists so the participant flow can be exercised
 * end-to-end. It is reachable only from the operator console and the
 * development simulator, never from a public route.
 */

export interface JoinResult {
  session: BusinessSessionPreview;
  participantId: string;
  realtimeToken: string;
  targetLanguage: string;
}

export class BusinessService {
  constructor(private readonly context: AppContext) {}

  private get prisma(): PrismaClient {
    return this.context.prisma;
  }

  private hashCode(code: string): string {
    return hashIdentifier(`business:${code}`, this.context.env.SESSION_SIGNING_SECRET);
  }

  /** Creates a broadcast room and returns its code — shown exactly once. */
  async createSession(input: {
    title: string;
    organizerName: string;
    sourceLanguage: string;
    targetLanguages: string[];
    maxParticipants?: number;
    expiresInHours: number;
    createdByUserId: string | null;
  }): Promise<{
    sessionId: string;
    code: string;
    joinUrl: string;
    deepLink: string;
    organizerToken: string;
    expiresAt: Date;
  }> {
    const maxTargets = this.context.runtimeConfig.number('MAX_BUSINESS_TARGET_LANGUAGES');
    if (input.targetLanguages.length > maxTargets) {
      throw new LingoLiveError(
        'VALIDATION_FAILED',
        `At most ${maxTargets} target languages are supported`,
      );
    }

    const expiresAt = new Date(Date.now() + input.expiresInHours * 3_600_000);
    const code = generateAccessCode();

    const session = await this.prisma.session.create({
      data: {
        kind: SessionKind.BUSINESS_BROADCAST,
        ownerUserId: input.createdByUserId,
        title: input.title,
        organizerName: input.organizerName,
        status: SessionStatus.PENDING,
        sourceLanguage: input.sourceLanguage,
        readingLanguage: 'original',
        expiresAt,
        accessCodes: {
          create: {
            codeHash: this.hashCode(code),
            expiresAt,
            maxParticipants: input.maxParticipants ?? null,
          },
        },
        // Pre-declared languages become slots so the preview can advertise
        // them before the first participant arrives.
        slots: {
          create: input.targetLanguages.map((language, index) => ({
            position: index,
            readingLanguage: normalizeLanguageTag(language),
            rotation: 0,
          })),
        },
      },
    });

    const { token: organizerToken } = createToken(
      {
        sub: input.createdByUserId ?? 'simulator',
        typ: 'organizer',
        sessionId: session.id,
        role: 'OWNER',
        ttlSeconds: input.expiresInHours * 3600,
      },
      this.context.env.SESSION_SIGNING_SECRET,
    );

    const linkConfig = {
      scheme: this.context.env.DEEP_LINK_SCHEME,
      webBaseUrl: this.context.env.WEB_BASE_URL,
    };

    return {
      sessionId: session.id,
      code,
      joinUrl: buildJoinUrl({ code }, linkConfig),
      deepLink: buildJoinDeepLink({ code }, linkConfig),
      organizerToken,
      expiresAt,
    };
  }

  /** Resolves a 6-digit code to a room, without joining it. */
  async preview(rawCode: string): Promise<BusinessSessionPreview> {
    const code = normalizeAccessCode(rawCode);
    if (code.length !== 6) {
      throw new LingoLiveError('INVALID_ACCESS_CODE', 'Access code must be six digits');
    }

    const accessCode = await this.prisma.businessAccessCode.findUnique({
      where: { codeHash: this.hashCode(code) },
      include: { session: { include: { slots: true } } },
    });

    if (!accessCode || !accessCode.active || accessCode.revokedAt) {
      throw new LingoLiveError('INVALID_ACCESS_CODE', 'This code is not valid');
    }
    if (accessCode.expiresAt.getTime() < Date.now()) {
      throw new LingoLiveError('ACCESS_CODE_EXPIRED', 'This code has expired');
    }
    if (
      accessCode.session.status === SessionStatus.ENDED ||
      accessCode.session.status === SessionStatus.EXPIRED
    ) {
      throw new LingoLiveError('SESSION_ALREADY_ENDED', 'This session has ended');
    }

    return this.toPreview(accessCode.session, accessCode.session.slots);
  }

  /**
   * Joins a room. No account is ever required — a guest receives an ephemeral
   * participant identity that exists only for the duration of the session.
   */
  async join(input: {
    code?: string;
    joinToken?: string;
    targetLanguage: string;
    anonymousId?: string;
    displayName?: string;
    userId?: string | null;
  }): Promise<JoinResult> {
    if (!this.context.runtimeConfig.flag('businessJoinEnabled')) {
      throw new LingoLiveError('SERVICE_UNAVAILABLE', 'Joining sessions is temporarily disabled');
    }

    const started = Date.now();
    const sessionId = input.joinToken
      ? this.resolveJoinToken(input.joinToken)
      : (await this.resolveCode(input.code ?? '')).sessionId;

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { slots: true, accessCodes: true, _count: { select: { participants: true } } },
    });
    if (!session) throw new LingoLiveError('INVALID_ACCESS_CODE', 'This code is not valid');
    if (session.status === SessionStatus.ENDED || session.status === SessionStatus.EXPIRED) {
      throw new LingoLiveError('SESSION_ALREADY_ENDED', 'This session has ended');
    }

    const accessCode = session.accessCodes.find((c) => c.active && !c.revokedAt);
    if (accessCode?.maxParticipants && session._count.participants >= accessCode.maxParticipants) {
      throw new LingoLiveError('SESSION_FULL', 'This session is full');
    }

    const targetLanguage = normalizeLanguageTag(input.targetLanguage);
    const anonymousHash = input.anonymousId
      ? hashIdentifier(input.anonymousId, this.context.env.SESSION_SIGNING_SECRET)
      : null;

    const participant = await this.prisma.participant.create({
      data: {
        sessionId: session.id,
        userId: input.userId ?? null,
        anonymousHash,
        role: ParticipantRole.VIEWER,
        displayName: input.displayName ?? null,
        targetLanguage,
      },
    });

    if (accessCode) {
      await this.prisma.businessAccessCode.update({
        where: { id: accessCode.id },
        data: { usedCount: { increment: 1 } },
      });
    }

    const { token: realtimeToken } = createToken(
      {
        sub: input.userId ?? `guest:${participant.id}`,
        typ: 'realtime',
        sessionId: session.id,
        participantId: participant.id,
        role: 'VIEWER',
        targetLanguage,
        isGuest: !input.userId,
        // A viewer token lives as long as a long conference, unlike the
        // 60-second provider credential.
        ttlSeconds: 6 * 3600,
      },
      this.context.env.SESSION_SIGNING_SECRET,
    );

    this.context.metrics.recordLatency('business.join', Date.now() - started);
    this.context.metrics.increment('business.join.succeeded');

    return {
      session: this.toPreview(session, session.slots, session._count.participants + 1),
      participantId: participant.id,
      realtimeToken,
      targetLanguage,
    };
  }

  private async resolveCode(rawCode: string): Promise<{ sessionId: string }> {
    const code = normalizeAccessCode(rawCode);
    if (code.length !== 6) {
      this.context.metrics.increment('business.join.failed');
      throw new LingoLiveError('INVALID_ACCESS_CODE', 'Access code must be six digits');
    }
    const accessCode = await this.prisma.businessAccessCode.findUnique({
      where: { codeHash: this.hashCode(code) },
    });
    if (!accessCode || !accessCode.active || accessCode.revokedAt) {
      this.context.metrics.increment('business.join.failed');
      throw new LingoLiveError('INVALID_ACCESS_CODE', 'This code is not valid');
    }
    if (accessCode.expiresAt.getTime() < Date.now()) {
      this.context.metrics.increment('business.join.failed');
      throw new LingoLiveError('ACCESS_CODE_EXPIRED', 'This code has expired');
    }
    return { sessionId: accessCode.sessionId };
  }

  private resolveJoinToken(token: string): string {
    const claims = verifyToken(token, this.context.env.SESSION_SIGNING_SECRET, 'business_join');
    if (!claims.sessionId) {
      throw new LingoLiveError('INVALID_ACCESS_CODE', 'This link is not valid');
    }
    return claims.sessionId;
  }

  /** A signed link that lets a QR code carry access without showing the code. */
  createJoinToken(sessionId: string, ttlSeconds: number): string {
    return createToken(
      { sub: `join:${sessionId}`, typ: 'business_join', sessionId, ttlSeconds },
      this.context.env.SESSION_SIGNING_SECRET,
    ).token;
  }

  async setViewerLanguage(
    sessionId: string,
    participantId: string,
    targetLanguage: string,
  ): Promise<string> {
    const normalized = normalizeLanguageTag(targetLanguage);
    const participant = await this.prisma.participant.findUnique({ where: { id: participantId } });
    if (!participant || participant.sessionId !== sessionId) {
      throw new LingoLiveError('NOT_FOUND', 'Participant not found');
    }
    await this.prisma.participant.update({
      where: { id: participantId },
      data: { targetLanguage: normalized },
    });
    return normalized;
  }

  async revokeCode(codeId: string): Promise<void> {
    await this.prisma.businessAccessCode.update({
      where: { id: codeId },
      data: { active: false, revokedAt: new Date() },
    });
  }

  /**
   * Every distinct language a room must currently produce: the languages
   * connected viewers are reading, plus any the organizer pre-declared.
   * This list is exactly what gets translated — once each.
   */
  async activeTargetLanguages(sessionId: string): Promise<string[]> {
    const [participants, slots] = await Promise.all([
      this.prisma.participant.findMany({
        where: { sessionId, leftAt: null },
        select: { targetLanguage: true },
      }),
      this.prisma.speakerSlot.findMany({ where: { sessionId }, select: { readingLanguage: true } }),
    ]);

    const languages = new Set<string>();
    for (const participant of participants) {
      if (participant.targetLanguage) languages.add(participant.targetLanguage);
    }
    for (const slot of slots) languages.add(slot.readingLanguage);
    // Live connections are the freshest signal — a viewer who switched
    // language mid-session is reflected here before the database write lands.
    for (const language of this.context.hub.languagesFor(sessionId)) languages.add(language);

    return [...languages];
  }

  private toPreview(
    session: {
      id: string;
      title: string | null;
      organizerName: string | null;
      status: SessionStatus;
      startedAt: Date;
    },
    slots: Array<{ readingLanguage: string }>,
    participantCount = 0,
  ): BusinessSessionPreview {
    return {
      sessionId: session.id,
      title: session.title ?? 'LingoLive session',
      organizerName: session.organizerName ?? '',
      status: session.status,
      availableLanguages: [...new Set(slots.map((slot) => slot.readingLanguage))],
      participantCount,
      startedAt: session.status === SessionStatus.PENDING ? null : session.startedAt.toISOString(),
    };
  }
}
