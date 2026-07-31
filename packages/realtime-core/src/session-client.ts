import {
  clientEventSchema,
  parseServerEvent,
  REALTIME_PROTOCOL_VERSION,
  type ClientEvent,
  type ServerEvent,
} from '@lingolive/contracts';
import { backoffDelayMs, shouldGiveUp, type BackoffOptions } from './state-machine.js';

/**
 * Minimal WebSocket surface. Declared here rather than imported from `ws` or
 * `lib.dom` so the same client runs in Node, the browser and Hermes.
 */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export const SOCKET_OPEN = 1;

export interface SessionClientOptions {
  url: string;
  token: string;
  socketFactory: SocketFactory;
  /** Resume point after a reconnection. Updated automatically as finals land. */
  lastSequence?: number;
  heartbeatIntervalMs?: number;
  backoff?: BackoffOptions;
  onEvent: (event: ServerEvent) => void;
  onStatusChange?: (status: SessionClientStatus) => void;
  /** Injected for deterministic tests. */
  now?: () => number;
  setTimeoutFn?: (handler: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  random?: () => number;
}

export type SessionClientStatus =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'failed';

/**
 * Talks to the LingoLive realtime hub.
 *
 * Guarantees:
 *  - never more than one socket open at a time;
 *  - reconnects with exponential backoff + jitter, giving up cleanly;
 *  - always rejoins with the last sequence it rendered, so the server replays
 *    exactly the missing segments and no duplicates;
 *  - stops entirely once the session is over — no ghost stream, no ghost cost.
 */
export class SessionClient {
  private socket: SocketLike | null = null;
  private status: SessionClientStatus = 'idle';
  private attempt = 0;
  private lastSequence: number;
  private heartbeatHandle: unknown = null;
  private reconnectHandle: unknown = null;
  private closedByUser = false;
  private readonly setTimeoutFn: (handler: () => void, ms: number) => unknown;
  private readonly clearTimeoutFn: (handle: unknown) => void;
  private readonly random: () => number;

  messagesSent = 0;
  messagesReceived = 0;

  constructor(private readonly options: SessionClientOptions) {
    this.lastSequence = options.lastSequence ?? 0;
    this.setTimeoutFn =
      options.setTimeoutFn ?? ((handler, ms) => setTimeout(handler, ms) as unknown);
    this.clearTimeoutFn =
      options.clearTimeoutFn ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.random = options.random ?? Math.random;
  }

  getStatus(): SessionClientStatus {
    return this.status;
  }

  getLastSequence(): number {
    return this.lastSequence;
  }

  connect(): void {
    if (this.socket || this.closedByUser) return;
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');

    const socket = this.options.socketFactory(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.setStatus('connected');
      this.send({
        type: 'session.join',
        token: this.options.token,
        lastSequence: this.lastSequence,
        protocolVersion: REALTIME_PROTOCOL_VERSION,
      });
      this.startHeartbeat();
    };

    socket.onmessage = (event) => {
      this.messagesReceived += 1;
      const parsed = this.decode(event.data);
      if (!parsed) return;
      this.trackSequence(parsed);
      this.options.onEvent(parsed);
      if (parsed.type === 'session.ended') {
        this.closedByUser = true;
        this.teardown('closed');
      }
    };

    socket.onerror = () => {
      // `onclose` always follows; reconnection is handled there so the retry
      // path exists in exactly one place.
    };

    socket.onclose = () => {
      this.stopHeartbeat();
      this.socket = null;
      if (this.closedByUser) {
        this.setStatus('closed');
        return;
      }
      this.scheduleReconnect();
    };
  }

  send(event: ClientEvent): boolean {
    const validated = clientEventSchema.safeParse(event);
    if (!validated.success) return false;
    if (!this.socket || this.socket.readyState !== SOCKET_OPEN) return false;
    this.socket.send(JSON.stringify(validated.data));
    this.messagesSent += 1;
    return true;
  }

  /** Graceful shutdown: tells the server, then stops retrying. */
  close(): void {
    this.closedByUser = true;
    if (this.socket && this.socket.readyState === SOCKET_OPEN) {
      this.send({ type: 'session.leave' });
    }
    this.teardown('closed');
  }

  private teardown(status: SessionClientStatus): void {
    this.stopHeartbeat();
    if (this.reconnectHandle) {
      this.clearTimeoutFn(this.reconnectHandle);
      this.reconnectHandle = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Socket already gone — nothing to do.
      }
      this.socket = null;
    }
    this.setStatus(status);
  }

  private scheduleReconnect(): void {
    this.attempt += 1;
    if (shouldGiveUp(this.attempt, this.options.backoff)) {
      this.setStatus('failed');
      return;
    }
    this.setStatus('reconnecting');
    const delay = backoffDelayMs(this.attempt, this.options.backoff, this.random);
    this.reconnectHandle = this.setTimeoutFn(() => {
      this.reconnectHandle = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const interval = this.options.heartbeatIntervalMs ?? 20_000;
    const tick = () => {
      this.send({ type: 'session.heartbeat' });
      this.heartbeatHandle = this.setTimeoutFn(tick, interval);
    };
    this.heartbeatHandle = this.setTimeoutFn(tick, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatHandle) {
      this.clearTimeoutFn(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }
  }

  private trackSequence(event: ServerEvent): void {
    if (event.type === 'transcript.final') {
      this.lastSequence = Math.max(this.lastSequence, event.segment.sequence);
    } else if (event.type === 'session.snapshot') {
      this.lastSequence = Math.max(this.lastSequence, event.lastSequence);
    }
  }

  private decode(raw: unknown): ServerEvent | null {
    try {
      const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parseServerEvent(value);
    } catch {
      return null;
    }
  }

  private setStatus(status: SessionClientStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatusChange?.(status);
  }
}
