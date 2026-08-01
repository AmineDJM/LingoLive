import { z } from 'zod';
import { languageCodeSchema, readingLanguageSchema } from './languages.js';
import { rotationSchema, sessionStatusSchema } from './session.js';
import { transcriptSegmentSchema, translationSchema } from './transcript.js';
import { API_ERROR_CODES } from './errors.js';

/** Current wire version. Bumped on any breaking event-shape change. */
export const REALTIME_PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------
// Client → Server
// ---------------------------------------------------------------------------

export const clientEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session.join'),
    /** Signed participant token issued by POST /realtime/* or /business/join. */
    token: z.string().min(10),
    /** Highest sequence already rendered; server replays anything newer. */
    lastSequence: z.number().int().min(0).optional(),
    protocolVersion: z.number().int().optional(),
  }),
  z.object({ type: z.literal('session.leave') }),
  z.object({ type: z.literal('session.heartbeat'), clientTimeMs: z.number().int().optional() }),
  z.object({
    type: z.literal('speaker.start'),
    slotId: z.string().optional(),
  }),
  z.object({
    type: z.literal('speaker.stop'),
    slotId: z.string().optional(),
  }),
  z.object({
    type: z.literal('language.set'),
    language: readingLanguageSchema,
    slotId: z.string().optional(),
  }),
  z.object({
    type: z.literal('slot.rotate'),
    slotId: z.string(),
    rotation: rotationSchema,
  }),
  /**
   * Sent by clients that run the transcription transport themselves (web
   * WebRTC / mobile native). The server owns sequencing, persistence,
   * translation fan-out and usage accounting — never the client.
   */
  z.object({
    type: z.literal('transcript.partial'),
    slotId: z.string().optional(),
    text: z.string().max(4000),
    sourceLanguage: z.string().max(20).optional(),
  }),
  z.object({
    type: z.literal('transcript.final'),
    slotId: z.string().optional(),
    text: z.string().max(4000),
    sourceLanguage: z.string().max(20).optional(),
    startedAtMs: z.number().int().min(0).optional(),
    endedAtMs: z.number().int().min(0).optional(),
    /** Idempotency guard so a reconnect mid-flush cannot duplicate a segment. */
    clientSegmentId: z.string().max(64).optional(),
  }),
  z.object({
    type: z.literal('audio.usage'),
    /** Audio seconds actually transmitted, reported for reconciliation only. */
    seconds: z.number().min(0).max(3600),
  }),
  z.object({ type: z.literal('session.pause') }),
  z.object({ type: z.literal('session.resume') }),
  z.object({ type: z.literal('session.end') }),
]);

export type ClientEvent = z.infer<typeof clientEventSchema>;
export type ClientEventType = ClientEvent['type'];

// ---------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------

export const realtimeParticipantSchema = z.object({
  id: z.string(),
  role: z.enum(['OWNER', 'SPEAKER_SLOT', 'VIEWER']),
  targetLanguage: z.string().nullable(),
});

export const serverEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session.snapshot'),
    sessionId: z.string(),
    status: sessionStatusSchema,
    protocolVersion: z.number().int(),
    title: z.string().nullable(),
    organizerName: z.string().nullable(),
    kind: z.string(),
    startedAt: z.string(),
    readingLanguage: z.string(),
    /** Replayed history, ordered by sequence, already translated for me. */
    segments: z.array(
      z.object({
        segment: transcriptSegmentSchema,
        translations: z.array(translationSchema),
      }),
    ),
    lastSequence: z.number().int().min(0),
    participantCount: z.number().int().min(0),
    /** Server clock, so clients can render durations without drift. */
    serverTimeMs: z.number().int(),
  }),
  z.object({
    type: z.literal('session.status'),
    status: sessionStatusSchema,
    reason: z.string().optional(),
  }),
  z.object({ type: z.literal('participant.count'), count: z.number().int().min(0) }),
  z.object({
    type: z.literal('transcript.partial'),
    sessionId: z.string(),
    slotId: z.string().nullable(),
    text: z.string(),
    sourceLanguage: z.string().nullable(),
    /** Partials share the sequence they will occupy once finalised. */
    sequence: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('transcript.final'),
    segment: transcriptSegmentSchema,
  }),
  z.object({
    type: z.literal('translation.partial'),
    sessionId: z.string(),
    sequence: z.number().int().min(0),
    targetLanguage: languageCodeSchema,
    text: z.string(),
  }),
  z.object({
    type: z.literal('translation.final'),
    translation: translationSchema,
  }),
  z.object({
    type: z.literal('speaker.state'),
    slotId: z.string().nullable(),
    speaking: z.boolean(),
  }),
  z.object({
    type: z.literal('usage.update'),
    secondsUsedThisSession: z.number().min(0),
    secondsRemainingThisPeriod: z.number().nullable(),
    /** Set when the user should be warned before hitting the quota wall. */
    warning: z.enum(['APPROACHING_QUOTA', 'APPROACHING_SESSION_LIMIT']).nullable(),
  }),
  z.object({
    type: z.literal('session.ended'),
    sessionId: z.string(),
    durationSeconds: z.number().int().min(0),
    reason: z.enum([
      'USER_ENDED',
      'IDLE_TIMEOUT',
      'MAX_DURATION',
      'QUOTA',
      'ORGANIZER_ENDED',
      'SERVER_SHUTDOWN',
    ]),
  }),
  z.object({ type: z.literal('pong'), serverTimeMs: z.number().int() }),
  z.object({
    type: z.literal('error'),
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    requestId: z.string(),
    /** `false` means the client must not retry with the same token. */
    retryable: z.boolean(),
  }),
]);

export type ServerEvent = z.infer<typeof serverEventSchema>;
export type ServerEventType = ServerEvent['type'];

export function parseServerEvent(raw: unknown): ServerEvent | null {
  const parsed = serverEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseClientEvent(raw: unknown): ClientEvent | null {
  const parsed = clientEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Transport-agnostic transcription abstraction (see docs/REALTIME.md)
// ---------------------------------------------------------------------------

export const transcriptionConfigSchema = z.object({
  sessionId: z.string(),
  /** Short-lived credential. NEVER the standard OpenAI API key. */
  clientSecret: z.string(),
  expiresAt: z.string(),
  model: z.string(),
  /** WebRTC offer/answer endpoint or WebSocket URL, depending on transport. */
  endpoint: z.string(),
  /**
   * Exact URL the client POSTs its SDP offer to.
   *
   * Built by the server rather than assembled in the browser: if the provider
   * moves it, that is an environment variable on one service, not a release of
   * two client applications.
   */
  sdpUrl: z.string(),
  transport: z.enum(['webrtc', 'websocket', 'mock']),
  audio: z.object({
    sampleRateHz: z.number().int(),
    encoding: z.enum(['pcm16', 'opus']),
    channels: z.number().int().min(1).max(2),
    chunkMs: z.number().int(),
  }),
  vad: z.object({
    mode: z.enum(['server', 'manual']),
    silenceMs: z.number().int(),
    threshold: z.number().min(0).max(1),
    prefixPaddingMs: z.number().int(),
  }),
  /** `auto` unless the user pinned a spoken language. */
  spokenLanguage: z.string(),
  /** Words/names to bias recognition toward, when the model supports it. */
  vocabularyHints: z.array(z.string()).max(100).default([]),
  noiseReduction: z.enum(['none', 'near_field', 'far_field']).default('near_field'),
});
export type TranscriptionConfig = z.infer<typeof transcriptionConfigSchema>;

export interface PartialTranscript {
  readonly text: string;
  readonly sourceLanguage?: string | undefined;
}

export interface FinalTranscript {
  readonly text: string;
  readonly sourceLanguage?: string | undefined;
  readonly startedAtMs?: number | undefined;
  readonly endedAtMs?: number | undefined;
  readonly clientSegmentId?: string | undefined;
}

export type Unsubscribe = () => void;
export type PartialHandler = (partial: PartialTranscript) => void;
export type FinalHandler = (final: FinalTranscript) => void;
export type StateHandler = (state: RealtimeState) => void;
export type ErrorHandler = (error: RealtimeTransportError) => void;

export interface RealtimeTransportError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  /**
   * Identifying detail safe to show next to the code — an upstream status, the
   * provider's own error code.
   *
   * A transport failure happens in the browser and leaves no server log line,
   * so if this is empty there is nothing anywhere to diagnose it from. That is
   * not hypothetical: `SDP_EXCHANGE_FAILED` alone cannot distinguish a wrong
   * URL from a rejected parameter, and both look like "an error occurred".
   */
  readonly details?: Record<string, unknown> | undefined;
}

/**
 * Every platform implements exactly this. The Listen/Discuss features are
 * written against the interface and never against a specific transport, so
 * swapping WebRTC ⇄ WebSocket ⇄ mock changes zero feature code.
 */
export interface RealtimeTranscriptionTransport {
  connect(config: TranscriptionConfig): Promise<void>;
  startAudio(): Promise<void>;
  stopAudio(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  disconnect(): Promise<void>;
  onPartial(handler: PartialHandler): Unsubscribe;
  onFinal(handler: FinalHandler): Unsubscribe;
  onStateChange(handler: StateHandler): Unsubscribe;
  onError(handler: ErrorHandler): Unsubscribe;
}

/** The one and only session lifecycle vocabulary, shared by web and mobile. */
export const REALTIME_STATES = [
  'idle',
  'requesting_permission',
  'requesting_token',
  'connecting',
  'ready',
  'listening',
  'paused',
  'reconnecting',
  'ending',
  'ended',
  'error',
] as const;
export const realtimeStateSchema = z.enum(REALTIME_STATES);
export type RealtimeState = z.infer<typeof realtimeStateSchema>;
