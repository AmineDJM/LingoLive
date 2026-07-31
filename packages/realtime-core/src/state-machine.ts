import type { RealtimeState } from '@lingolive/contracts';

/**
 * The one realtime lifecycle, shared by web and mobile.
 *
 * Making the transition table explicit (rather than a pile of booleans) is what
 * stops the two classes of bug that ruin a live-transcription product:
 *  - opening a second socket while the first is still reconnecting;
 *  - capturing audio in a state where nothing is listening for it.
 */

export type RealtimeAction =
  | { type: 'PERMISSION_REQUESTED' }
  | { type: 'PERMISSION_GRANTED' }
  | { type: 'PERMISSION_DENIED'; reason?: string }
  | { type: 'TOKEN_REQUESTED' }
  | { type: 'TOKEN_RECEIVED' }
  | { type: 'CONNECTED' }
  | { type: 'AUDIO_STARTED' }
  | { type: 'AUDIO_STOPPED' }
  | { type: 'PAUSED' }
  | { type: 'RESUMED' }
  | { type: 'CONNECTION_LOST' }
  | { type: 'RECONNECTED' }
  | { type: 'END_REQUESTED' }
  | { type: 'ENDED' }
  | { type: 'ERROR'; code: string; message: string; retryable: boolean }
  | { type: 'RESET' };

export interface RealtimeContext {
  readonly state: RealtimeState;
  readonly attempt: number;
  readonly error: { code: string; message: string; retryable: boolean } | null;
  /** True whenever the microphone must actually be capturing. */
  readonly capturing: boolean;
  /** True whenever the UI must show the "recording" affordance. */
  readonly micIndicatorVisible: boolean;
}

export const initialContext: RealtimeContext = {
  state: 'idle',
  attempt: 0,
  error: null,
  capturing: false,
  micIndicatorVisible: false,
};

/**
 * Allowed transitions. Anything not listed is ignored (and reported by
 * `isValidTransition`) rather than silently corrupting the session.
 */
const TRANSITIONS: Record<RealtimeState, readonly RealtimeState[]> = {
  idle: ['requesting_permission', 'requesting_token', 'error', 'ended'],
  requesting_permission: ['requesting_token', 'idle', 'error'],
  requesting_token: ['connecting', 'error', 'idle', 'ending'],
  connecting: ['ready', 'reconnecting', 'error', 'ending'],
  ready: ['listening', 'paused', 'reconnecting', 'ending', 'error'],
  listening: ['ready', 'paused', 'reconnecting', 'ending', 'error'],
  paused: ['listening', 'ready', 'reconnecting', 'ending', 'error'],
  reconnecting: ['ready', 'listening', 'ending', 'error', 'ended'],
  ending: ['ended', 'error'],
  ended: ['idle'],
  error: ['idle', 'requesting_token', 'reconnecting', 'ended'],
};

export function isValidTransition(from: RealtimeState, to: RealtimeState): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

function withState(
  context: RealtimeContext,
  state: RealtimeState,
  patch: Partial<RealtimeContext> = {},
): RealtimeContext {
  if (!isValidTransition(context.state, state)) return context;
  const capturing = patch.capturing ?? state === 'listening';
  return {
    ...context,
    ...patch,
    state,
    capturing,
    // The indicator stays up through a reconnect so the user is never told the
    // microphone is off while the app is still holding it.
    micIndicatorVisible:
      state === 'listening' || state === 'reconnecting' || state === 'ready' || state === 'paused',
  };
}

export function realtimeReducer(context: RealtimeContext, action: RealtimeAction): RealtimeContext {
  switch (action.type) {
    case 'PERMISSION_REQUESTED':
      return withState(context, 'requesting_permission');
    case 'PERMISSION_GRANTED':
      return withState(context, 'requesting_token');
    case 'PERMISSION_DENIED':
      return withState(context, 'error', {
        error: {
          code: 'MIC_PERMISSION_DENIED',
          message: action.reason ?? 'Microphone permission denied',
          retryable: true,
        },
        capturing: false,
      });
    case 'TOKEN_REQUESTED':
      return withState(context, 'requesting_token');
    case 'TOKEN_RECEIVED':
      return withState(context, 'connecting');
    case 'CONNECTED':
      return withState(context, 'ready', { attempt: 0, error: null });
    case 'AUDIO_STARTED':
      return withState(context, 'listening');
    case 'AUDIO_STOPPED':
      return withState(context, 'ready', { capturing: false });
    case 'PAUSED':
      return withState(context, 'paused', { capturing: false });
    case 'RESUMED':
      return withState(context, 'listening');
    case 'CONNECTION_LOST':
      // Terminal states must not be dragged back into a reconnect loop.
      if (context.state === 'ended' || context.state === 'ending') return context;
      return withState(context, 'reconnecting', {
        attempt: context.attempt + 1,
        capturing: false,
      });
    case 'RECONNECTED':
      return withState(context, 'listening', { attempt: 0, error: null });
    case 'END_REQUESTED':
      return withState(context, 'ending', { capturing: false });
    case 'ENDED':
      return withState(context, 'ended', { capturing: false, micIndicatorVisible: false });
    case 'ERROR':
      return withState(context, 'error', {
        error: { code: action.code, message: action.message, retryable: action.retryable },
        capturing: false,
      });
    case 'RESET':
      return initialContext;
    default:
      return context;
  }
}

// ---------------------------------------------------------------------------
// Reconnection policy
// ---------------------------------------------------------------------------

export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
  /** Randomised ±jitter fraction, to avoid a thundering herd after an outage. */
  jitter?: number;
  maxAttempts?: number;
}

export const DEFAULT_BACKOFF: Required<BackoffOptions> = {
  baseMs: 500,
  maxMs: 15_000,
  jitter: 0.25,
  maxAttempts: 8,
};

/**
 * Exponential backoff with jitter. `random` is injectable so tests are
 * deterministic.
 */
export function backoffDelayMs(
  attempt: number,
  options: BackoffOptions = {},
  random: () => number = Math.random,
): number {
  const { baseMs, maxMs, jitter } = { ...DEFAULT_BACKOFF, ...options };
  const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  const spread = exponential * jitter;
  const delta = (random() * 2 - 1) * spread;
  return Math.max(0, Math.round(exponential + delta));
}

export function shouldGiveUp(attempt: number, options: BackoffOptions = {}): boolean {
  const { maxAttempts } = { ...DEFAULT_BACKOFF, ...options };
  return attempt >= maxAttempts;
}

// ---------------------------------------------------------------------------
// In-memory audio buffer used across a short disconnection
// ---------------------------------------------------------------------------

/**
 * Holds a few seconds of audio while the socket is down.
 *
 * Hard constraints (see docs/PRIVACY.md):
 *  - memory only, never a file;
 *  - bounded by duration, so a long outage cannot grow it without limit;
 *  - `clear()` is called on every terminal transition.
 */
export class BoundedAudioBuffer {
  private chunks: Array<{ data: Uint8Array; durationMs: number }> = [];
  private totalMs = 0;

  constructor(private readonly maxDurationMs = 4000) {}

  push(data: Uint8Array, durationMs: number): void {
    this.chunks.push({ data, durationMs });
    this.totalMs += durationMs;
    while (this.totalMs > this.maxDurationMs && this.chunks.length > 0) {
      const dropped = this.chunks.shift();
      if (dropped) this.totalMs -= dropped.durationMs;
    }
  }

  drain(): Uint8Array[] {
    const out = this.chunks.map((c) => c.data);
    this.clear();
    return out;
  }

  clear(): void {
    this.chunks = [];
    this.totalMs = 0;
  }

  get durationMs(): number {
    return this.totalMs;
  }

  get size(): number {
    return this.chunks.length;
  }
}
