import type { ServerEvent } from '@lingolive/contracts';
import type { Logger } from '@lingolive/logging';

/**
 * The realtime fan-out layer.
 *
 * One utterance is transcribed once and translated once per *distinct*
 * language; the hub is what turns that single result into thousands of
 * deliveries (ADR 0008). It also keeps every connection accountable, so the
 * operator console can show exactly who is attached to what.
 *
 * `RealtimeHub` is an interface on purpose: today it is in-process plus Redis
 * pub/sub for cross-instance delivery, and it can be swapped for a dedicated
 * pub/sub tier without touching a line of session or transcript logic.
 */

export interface Connection {
  readonly id: string;
  readonly sessionId: string;
  readonly participantId: string;
  readonly role: string;
  targetLanguage: string | null;
  /**
   * Every language this connection is rendering, not just its primary one.
   *
   * Discuss puts two to four tiles on ONE device over ONE socket, each reading
   * a different language. Matching delivery against a single `targetLanguage`
   * meant the other tiles' translations were computed, paid for, and then
   * dropped on the floor — Discuss transcribed but never translated.
   *
   * Empty means "fall back to `targetLanguage`", which is every Listen and
   * Business viewer.
   */
  targetLanguages?: Set<string>;
  readonly connectedAt: Date;
  lastHeartbeatAt: Date;
  lastSequenceSent: number;
  messagesSent: number;
  messagesReceived: number;
  readonly networkPrefix: string | null;
  send(event: ServerEvent): void;
  close(code?: number, reason?: string): void;
}

/** Does this connection render `language`? Case-insensitive, set or primary. */
function readsLanguage(connection: Connection, normalized: string): boolean {
  if (connection.targetLanguages?.size) return connection.targetLanguages.has(normalized);
  return (connection.targetLanguage ?? '').toLowerCase() === normalized;
}

export interface RoomStats {
  readonly sessionId: string;
  readonly subscribers: number;
  readonly activeLanguages: string[];
  readonly lastSequence: number;
}

export interface RealtimeHub {
  join(connection: Connection): void;
  leave(connectionId: string): void;
  /** Deliver to every connection in a room. */
  broadcast(sessionId: string, event: ServerEvent): void;
  /**
   * Deliver only to connections reading a given language.
   * This is the fan-out primitive: one translation, N deliveries.
   */
  broadcastToLanguage(sessionId: string, language: string, event: ServerEvent): void;
  sendTo(connectionId: string, event: ServerEvent): void;
  /** Every distinct reading language currently subscribed to a room. */
  languagesFor(sessionId: string): string[];
  connectionsFor(sessionId: string): Connection[];
  allConnections(): Connection[];
  rooms(): RoomStats[];
  setLanguage(connectionId: string, language: string): void;
  /** Replaces every language a connection renders — Discuss draws several. */
  setLanguages(connectionId: string, languages: readonly string[]): void;
  heartbeat(connectionId: string): void;
  /** Disconnect everyone in a room, e.g. when the organizer ends it. */
  closeRoom(sessionId: string, event: ServerEvent): void;
  close(): Promise<void>;
}

interface RedisPublisher {
  publish(channel: string, message: string): Promise<number>;
}

interface RedisSubscriber {
  subscribe(channel: string): Promise<unknown>;
  on(event: 'message', handler: (channel: string, message: string) => void): unknown;
  unsubscribe?(channel: string): Promise<unknown>;
  quit?(): Promise<unknown>;
}

const REDIS_CHANNEL = 'lingolive:realtime';

interface CrossInstanceMessage {
  /** Identifies the publishing instance so it ignores its own echo. */
  origin: string;
  sessionId: string;
  language: string | null;
  event: ServerEvent;
  kind: 'broadcast' | 'language' | 'close';
}

export class InProcessRealtimeHub implements RealtimeHub {
  private readonly connections = new Map<string, Connection>();
  private readonly roomIndex = new Map<string, Set<string>>();
  private readonly instanceId: string;

  constructor(
    private readonly logger: Logger,
    private readonly redis?: { publisher: RedisPublisher; subscriber: RedisSubscriber },
    instanceId?: string,
  ) {
    this.instanceId = instanceId ?? `api-${Math.random().toString(36).slice(2, 10)}`;
    if (this.redis) void this.attachRedis();
  }

  private async attachRedis(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.subscriber.subscribe(REDIS_CHANNEL);
      this.redis.subscriber.on('message', (channel, message) => {
        if (channel !== REDIS_CHANNEL) return;
        let parsed: CrossInstanceMessage;
        try {
          parsed = JSON.parse(message) as CrossInstanceMessage;
        } catch {
          return;
        }
        // Ignore our own publications — they were already delivered locally.
        if (parsed.origin === this.instanceId) return;
        this.deliverLocally(parsed);
      });
    } catch (error) {
      this.logger.warn(
        { err: error },
        'Realtime cross-instance channel unavailable; running single-instance',
      );
    }
  }

  private deliverLocally(message: CrossInstanceMessage): void {
    switch (message.kind) {
      case 'broadcast':
        this.localBroadcast(message.sessionId, message.event);
        break;
      case 'language':
        if (message.language) {
          this.localBroadcastToLanguage(message.sessionId, message.language, message.event);
        }
        break;
      case 'close':
        this.localCloseRoom(message.sessionId, message.event);
        break;
    }
  }

  private publish(message: Omit<CrossInstanceMessage, 'origin'>): void {
    if (!this.redis) return;
    void this.redis.publisher
      .publish(REDIS_CHANNEL, JSON.stringify({ ...message, origin: this.instanceId }))
      .catch((error: unknown) => {
        // A pub/sub outage degrades to single-instance delivery rather than
        // failing the request that triggered it.
        this.logger.warn({ err: error }, 'Failed to publish a realtime event');
      });
  }

  join(connection: Connection): void {
    this.connections.set(connection.id, connection);
    let room = this.roomIndex.get(connection.sessionId);
    if (!room) {
      room = new Set();
      this.roomIndex.set(connection.sessionId, room);
    }
    room.add(connection.id);
  }

  leave(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    this.connections.delete(connectionId);
    const room = this.roomIndex.get(connection.sessionId);
    if (room) {
      room.delete(connectionId);
      if (room.size === 0) this.roomIndex.delete(connection.sessionId);
    }
  }

  broadcast(sessionId: string, event: ServerEvent): void {
    this.localBroadcast(sessionId, event);
    this.publish({ kind: 'broadcast', sessionId, language: null, event });
  }

  broadcastToLanguage(sessionId: string, language: string, event: ServerEvent): void {
    this.localBroadcastToLanguage(sessionId, language, event);
    this.publish({ kind: 'language', sessionId, language, event });
  }

  private localBroadcast(sessionId: string, event: ServerEvent): void {
    for (const connection of this.connectionsFor(sessionId)) {
      this.deliver(connection, event);
    }
  }

  private localBroadcastToLanguage(sessionId: string, language: string, event: ServerEvent): void {
    const normalized = language.toLowerCase();
    for (const connection of this.connectionsFor(sessionId)) {
      if (readsLanguage(connection, normalized)) this.deliver(connection, event);
    }
  }

  private deliver(connection: Connection, event: ServerEvent): void {
    try {
      connection.send(event);
      connection.messagesSent += 1;
      if (event.type === 'transcript.final') {
        connection.lastSequenceSent = Math.max(connection.lastSequenceSent, event.segment.sequence);
      }
    } catch {
      // A dead socket must never break delivery to the rest of the room.
      this.leave(connection.id);
    }
  }

  sendTo(connectionId: string, event: ServerEvent): void {
    const connection = this.connections.get(connectionId);
    if (connection) this.deliver(connection, event);
  }

  languagesFor(sessionId: string): string[] {
    const languages = new Set<string>();
    for (const connection of this.connectionsFor(sessionId)) {
      for (const language of connection.targetLanguages ?? []) languages.add(language);
      if (connection.targetLanguage) languages.add(connection.targetLanguage);
    }
    return [...languages];
  }

  connectionsFor(sessionId: string): Connection[] {
    const ids = this.roomIndex.get(sessionId);
    if (!ids) return [];
    const result: Connection[] = [];
    for (const id of ids) {
      const connection = this.connections.get(id);
      if (connection) result.push(connection);
    }
    return result;
  }

  allConnections(): Connection[] {
    return [...this.connections.values()];
  }

  rooms(): RoomStats[] {
    const stats: RoomStats[] = [];
    for (const [sessionId, ids] of this.roomIndex) {
      const connections = [...ids]
        .map((id) => this.connections.get(id))
        .filter((c): c is Connection => Boolean(c));
      stats.push({
        sessionId,
        subscribers: connections.length,
        activeLanguages: [
          ...new Set(
            connections.map((c) => c.targetLanguage).filter((l): l is string => Boolean(l)),
          ),
        ],
        lastSequence: connections.reduce((max, c) => Math.max(max, c.lastSequenceSent), 0),
      });
    }
    return stats;
  }

  setLanguage(connectionId: string, language: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) connection.targetLanguage = language;
  }

  /** Replaces the full set of languages a connection renders. */
  setLanguages(connectionId: string, languages: readonly string[]): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    connection.targetLanguages = new Set(languages.map((language) => language.toLowerCase()));
  }

  heartbeat(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) connection.lastHeartbeatAt = new Date();
  }

  closeRoom(sessionId: string, event: ServerEvent): void {
    this.localCloseRoom(sessionId, event);
    this.publish({ kind: 'close', sessionId, language: null, event });
  }

  private localCloseRoom(sessionId: string, event: ServerEvent): void {
    for (const connection of this.connectionsFor(sessionId)) {
      this.deliver(connection, event);
      try {
        connection.close(1000, 'session ended');
      } catch {
        // Already closed.
      }
      this.leave(connection.id);
    }
  }

  async close(): Promise<void> {
    for (const connection of this.connections.values()) {
      try {
        connection.close(1001, 'server shutting down');
      } catch {
        // Already closed.
      }
    }
    this.connections.clear();
    this.roomIndex.clear();
    if (this.redis?.subscriber.unsubscribe) {
      await this.redis.subscriber.unsubscribe(REDIS_CHANNEL).catch(() => undefined);
    }
  }

  /** Drops connections that have not sent a heartbeat within the window. */
  pruneStale(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;
    for (const connection of [...this.connections.values()]) {
      if (connection.lastHeartbeatAt.getTime() < cutoff) {
        try {
          connection.close(1001, 'heartbeat timeout');
        } catch {
          // Already closed.
        }
        this.leave(connection.id);
        pruned += 1;
      }
    }
    return pruned;
  }
}
