import { createHash } from 'node:crypto';
import {
  SessionStatus,
  type Plan,
  type PrismaClient,
  type Session as DbSession,
  type SessionKind,
  type SpeakerSlot as DbSlot,
} from '@prisma/client';
import {
  defaultRotationsFor,
  LingoLiveError,
  normalizeLanguageTag,
  type CreateSessionRequest,
  type Rotation,
  type Session,
  type SessionSummary,
  type SpeakerSlot,
} from '@lingolive/contracts';
import type { AppContext } from '../context.js';
import { UsageService, type ActorIdentity } from './usage.js';
import { TranscriptService } from './transcripts.js';

/**
 * Session lifecycle.
 *
 * The privacy default lives here: a personal session that the user never
 * explicitly saved is deleted, not archived. `saveRequested` is the only thing
 * that keeps a transcript alive.
 */
export class SessionService {
  private readonly usage: UsageService;
  private readonly transcripts: TranscriptService;

  constructor(private readonly context: AppContext) {
    this.usage = new UsageService(context);
    this.transcripts = new TranscriptService(context);
  }

  private get prisma(): PrismaClient {
    return this.context.prisma;
  }

  async create(request: CreateSessionRequest, actor: ActorIdentity, plan: Plan): Promise<Session> {
    if (!this.context.runtimeConfig.flag('newSessionsEnabled')) {
      throw new LingoLiveError('SERVICE_UNAVAILABLE', 'New sessions are temporarily disabled');
    }

    const decision = await this.usage.checkQuota(actor, plan);
    if (!decision.allowed) {
      throw new LingoLiveError(
        decision.reason === 'COST_LIMIT' ? 'COST_LIMIT_REACHED' : 'QUOTA_EXCEEDED',
        decision.reason === 'COST_LIMIT'
          ? 'Service capacity limit reached; please try again later'
          : 'Monthly usage limit reached',
        { details: { minutesRemaining: decision.minutesRemaining } },
      );
    }

    const maxLanguages = this.context.runtimeConfig.number('MAX_DISCUSSION_LANGUAGES');
    if (request.kind === 'PERSONAL_DISCUSS') {
      const slots = request.slots ?? [];
      if (slots.length > maxLanguages) {
        throw new LingoLiveError(
          'VALIDATION_FAILED',
          `A discussion supports at most ${maxLanguages} people`,
        );
      }
    }

    const maxMinutes = this.context.runtimeConfig.number('MAX_PERSONAL_SESSION_MINUTES');
    const started = Date.now();

    const session = await this.prisma.session.create({
      data: {
        kind: request.kind as SessionKind,
        ownerUserId: actor.userId,
        anonymousOwnerHash: actor.anonymousHash,
        title: request.title ?? null,
        status: SessionStatus.LIVE,
        readingLanguage: request.readingLanguage ?? 'original',
        // A session that is never ended cleanly still expires, so an
        // abandoned tab cannot hold resources forever.
        expiresAt: new Date(Date.now() + maxMinutes * 60_000),
        slots:
          request.kind === 'PERSONAL_DISCUSS' && request.slots
            ? {
                create: request.slots.map((slot) => ({
                  position: slot.position,
                  readingLanguage: normalizeLanguageTag(slot.readingLanguage),
                  spokenLanguageHint: slot.spokenLanguageHint ?? 'auto',
                  rotation: slot.rotation,
                  displayName: slot.displayName ?? null,
                })),
              }
            : undefined,
      },
      include: { slots: { orderBy: { position: 'asc' } } },
    });

    await this.usage.recordSessionStarted(actor, session.id);
    this.context.metrics.recordLatency('session.create', Date.now() - started);
    this.context.metrics.increment(`session.created.${request.kind}`);
    this.context.analytics.capture('session_started', analyticsSubject(actor), {
      kind: request.kind,
      readingLanguage: request.readingLanguage ?? 'original',
    });

    return this.toContract(session, session.slots, 0);
  }

  async get(sessionId: string): Promise<Session> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { slots: { orderBy: { position: 'asc' } }, _count: { select: { segments: true } } },
    });
    if (!session) throw new LingoLiveError('SESSION_NOT_FOUND', 'Session not found');
    return this.toContract(session, session.slots, session._count.segments);
  }

  async requireOwnership(sessionId: string, actor: ActorIdentity): Promise<DbSession> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new LingoLiveError('SESSION_NOT_FOUND', 'Session not found');

    const ownsByAccount = actor.userId !== null && session.ownerUserId === actor.userId;
    const ownsByDevice =
      actor.anonymousHash !== null && session.anonymousOwnerHash === actor.anonymousHash;

    if (!ownsByAccount && !ownsByDevice) {
      // 404 rather than 403: an unauthorised caller learns nothing about
      // whether the session exists.
      throw new LingoLiveError('SESSION_NOT_FOUND', 'Session not found');
    }
    return session;
  }

  async end(
    sessionId: string,
    actor: ActorIdentity,
    options: { reportedAudioSeconds?: number; reason?: string } = {},
  ): Promise<Session> {
    const existing = await this.requireOwnership(sessionId, actor);
    if (existing.status === SessionStatus.ENDED) {
      return this.get(sessionId);
    }

    const endedAt = new Date();
    const durationSeconds = Math.max(
      0,
      Math.round((endedAt.getTime() - existing.startedAt.getTime()) / 1000),
    );

    // The client's number is a hint. The billable quantity is the server's own
    // measurement of the session window, capped by the reported value when
    // that is lower (pauses genuinely transmit no audio).
    const billableSeconds =
      options.reportedAudioSeconds !== undefined
        ? Math.min(durationSeconds, Math.max(0, options.reportedAudioSeconds))
        : durationSeconds;

    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.ENDED, endedAt, durationSeconds },
      include: { slots: { orderBy: { position: 'asc' } }, _count: { select: { segments: true } } },
    });

    await this.usage.recordAudioSeconds(actor, sessionId, billableSeconds);

    this.context.hub.closeRoom(sessionId, {
      type: 'session.ended',
      sessionId,
      durationSeconds,
      reason: 'USER_ENDED',
    });

    this.context.analytics.capture('session_ended', analyticsSubject(actor), {
      kind: session.kind,
      durationSeconds,
      segmentCount: session._count.segments,
      result: options.reason ?? 'USER_ENDED',
    });

    return this.toContract(session, session.slots, session._count.segments);
  }

  /**
   * The explicit save. Nothing else keeps a personal transcript: an unsaved
   * session is purged by the retention job.
   */
  async save(sessionId: string, actor: ActorIdentity, title?: string): Promise<Session> {
    await this.requireOwnership(sessionId, actor);
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: { saveRequested: true, ...(title ? { title } : {}) },
      include: { slots: { orderBy: { position: 'asc' } }, _count: { select: { segments: true } } },
    });
    this.context.metrics.increment('session.saved');
    return this.toContract(session, session.slots, session._count.segments);
  }

  async rename(sessionId: string, actor: ActorIdentity, title: string): Promise<Session> {
    await this.requireOwnership(sessionId, actor);
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: { title },
      include: { slots: { orderBy: { position: 'asc' } }, _count: { select: { segments: true } } },
    });
    return this.toContract(session, session.slots, session._count.segments);
  }

  /** Hard delete. Segments and translations cascade. */
  async remove(sessionId: string, actor: ActorIdentity): Promise<void> {
    await this.requireOwnership(sessionId, actor);
    await this.prisma.session.delete({ where: { id: sessionId } });
    this.context.metrics.increment('session.deleted');
  }

  async history(
    actor: ActorIdentity,
    options: { cursor?: string; limit?: number; search?: string } = {},
  ): Promise<{ items: SessionSummary[]; nextCursor: string | null; total: number }> {
    const limit = Math.min(100, options.limit ?? 30);
    const where = {
      // History shows only what the user explicitly chose to keep.
      saveRequested: true,
      ...(actor.userId !== null
        ? { ownerUserId: actor.userId }
        : { anonymousOwnerHash: actor.anonymousHash ?? '__none__' }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.session.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit + 1,
        ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
        include: {
          slots: true,
          segments: { orderBy: { sequence: 'asc' }, take: 3 },
          _count: { select: { segments: true } },
        },
      }),
      this.prisma.session.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    let items: SessionSummary[] = page.map((session) => {
      const preview = session.segments
        .map((segment) => this.context.cipher.tryDecrypt(segment.originalTextEncrypted) ?? '')
        .join(' ')
        .slice(0, 140);
      const languages = new Set<string>();
      if (session.readingLanguage && session.readingLanguage !== 'original') {
        languages.add(session.readingLanguage);
      }
      for (const slot of session.slots) languages.add(slot.readingLanguage);

      return {
        id: session.id,
        kind: session.kind,
        status: session.status,
        title: session.title,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString() ?? null,
        durationSeconds: session.durationSeconds,
        segmentCount: session._count.segments,
        languages: [...languages],
        preview,
      };
    });

    // Search runs over decrypted previews. Ciphertext is not searchable by
    // design; full-text search over saved transcripts is deliberately out of
    // scope for V1 rather than solved by storing plaintext.
    if (options.search) {
      const needle = options.search.toLowerCase();
      items = items.filter(
        (item) =>
          item.preview.toLowerCase().includes(needle) ||
          (item.title ?? '').toLowerCase().includes(needle),
      );
    }

    return {
      items,
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      total,
    };
  }

  async setStatus(sessionId: string, status: SessionStatus): Promise<void> {
    await this.prisma.session.update({ where: { id: sessionId }, data: { status } });
  }

  async exportText(sessionId: string, actor: ActorIdentity, language: string): Promise<string> {
    await this.requireOwnership(sessionId, actor);
    return this.transcripts.plainTextExport(sessionId, language);
  }

  toContract(
    session: DbSession & { organizerName?: string | null },
    slots: DbSlot[],
    segmentCount: number,
  ): Session {
    return {
      id: session.id,
      kind: session.kind,
      status: session.status,
      title: session.title,
      organizerName: session.organizerName ?? null,
      readingLanguage: session.readingLanguage,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      expiresAt: session.expiresAt?.toISOString() ?? null,
      saveRequested: session.saveRequested,
      audioStored: false,
      durationSeconds: session.durationSeconds,
      segmentCount,
      slots: slots.map((slot) => this.slotToContract(slot)),
    };
  }

  slotToContract(slot: DbSlot): SpeakerSlot {
    return {
      id: slot.id,
      sessionId: slot.sessionId,
      position: slot.position,
      displayName: slot.displayName,
      readingLanguage: slot.readingLanguage,
      spokenLanguageHint: slot.spokenLanguageHint,
      rotation: slot.rotation as Rotation,
    };
  }
}

/** Default reading languages for a new discussion, per §9.2. */
export function defaultDiscussionSlots(
  count: 2 | 3 | 4,
  preferredLanguage: string,
  recentLanguages: readonly string[],
): Array<{ position: number; readingLanguage: string; rotation: Rotation }> {
  const rotations = defaultRotationsFor(count);
  const used = new Set<string>([normalizeLanguageTag(preferredLanguage)]);
  const languages: string[] = [normalizeLanguageTag(preferredLanguage)];

  for (const candidate of recentLanguages) {
    if (languages.length >= count) break;
    const normalized = normalizeLanguageTag(candidate);
    if (used.has(normalized)) continue;
    used.add(normalized);
    languages.push(normalized);
  }

  // English is the fallback for the second tile, then any unused language.
  const fallbacks = ['en', 'es', 'fr', 'ar'];
  for (const fallback of fallbacks) {
    if (languages.length >= count) break;
    if (used.has(fallback)) continue;
    used.add(fallback);
    languages.push(fallback);
  }

  return Array.from({ length: count }, (_, position) => ({
    position,
    readingLanguage: languages[position] ?? 'en',
    rotation: rotations[position] ?? 0,
  }));
}

/**
 * The analytics subject.
 *
 * Never the user id and never the anonymous device hash: a truncated,
 * one-way-derived value is enough to count distinct users without letting the
 * analytics store join back to a LingoLive account.
 */
function analyticsSubject(actor: ActorIdentity): string {
  const material = actor.userId ?? actor.anonymousHash ?? 'anonymous';
  return `s_${createHash('sha256').update(material).digest('hex').slice(0, 16)}`;
}
