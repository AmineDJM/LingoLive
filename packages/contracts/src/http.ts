import { z } from 'zod';
import {
  languageCodeSchema,
  readingLanguageSchema,
  spokenLanguageSchema,
} from './languages.js';
import { localeSchema } from './locales.js';
import {
  accessCodeSchema,
  discussParticipantCountSchema,
  rotationSchema,
  sessionKindSchema,
  sessionSchema,
  sessionSummarySchema,
} from './session.js';
import {
  renderedSegmentSchema,
  transcriptExportFormatSchema,
  transcriptSegmentSchema,
} from './transcript.js';
import { entitlementSchema, quotaSchema, usageSummarySchema } from './entitlements.js';
import { transcriptionConfigSchema } from './realtime.js';

export const API_VERSION_PREFIX = '/api/v1';

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const themeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof themeSchema>;

export const meResponseSchema = z.object({
  id: z.string(),
  isGuest: z.boolean(),
  isAdmin: z.boolean(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  preferredLocale: localeSchema,
  preferredReadingLanguage: readingLanguageSchema,
  theme: themeSchema,
  transcriptFontScale: z.number().min(0.75).max(2.5),
  hapticsEnabled: z.boolean(),
  autoSaveTranscripts: z.boolean(),
  onboardingCompleted: z.boolean(),
  entitlement: entitlementSchema,
  quota: quotaSchema,
  createdAt: z.string(),
  deletionRequestedAt: z.string().nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const updateMeRequestSchema = z
  .object({
    displayName: z.string().trim().max(60).nullable().optional(),
    preferredLocale: localeSchema.optional(),
    preferredReadingLanguage: readingLanguageSchema.optional(),
    theme: themeSchema.optional(),
    transcriptFontScale: z.number().min(0.75).max(2.5).optional(),
    hapticsEnabled: z.boolean().optional(),
    autoSaveTranscripts: z.boolean().optional(),
    onboardingCompleted: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;

export const deleteMeResponseSchema = z.object({
  status: z.enum(['SCHEDULED', 'COMPLETED']),
  requestId: z.string(),
  /** When the irreversible purge will run. */
  scheduledFor: z.string(),
  deletedSessions: z.number().int().min(0),
});
export type DeleteMeResponse = z.infer<typeof deleteMeResponseSchema>;

// ---------------------------------------------------------------------------
// Guest / device registration
// ---------------------------------------------------------------------------

export const platformSchema = z.enum(['ios', 'android', 'web', 'unknown']);

export const registerDeviceRequestSchema = z.object({
  /** 128-bit random value generated on-device. NOT an advertising identifier. */
  anonymousId: z.string().min(16).max(128),
  platform: platformSchema,
  appVersion: z.string().max(32).optional(),
  locale: z.string().max(20).optional(),
});
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;

export const authTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  expiresAt: z.string(),
  user: meResponseSchema,
});
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>;

export const linkAccountRequestSchema = z.object({
  /** Provider-issued identity token. Verified server-side. */
  identityToken: z.string().min(10),
  provider: z.enum(['apple', 'google', 'email', 'local']),
  /** Present for local/dev sign-in only. */
  email: z.string().max(320).optional(),
});
export type LinkAccountRequest = z.infer<typeof linkAccountRequestSchema>;

// ---------------------------------------------------------------------------
// Realtime tokens
// ---------------------------------------------------------------------------

export const transcriptionTokenRequestSchema = z.object({
  sessionId: z.string(),
  /** Lets the server pick the right transport + VAD profile. */
  platform: platformSchema,
  preferredTransport: z.enum(['webrtc', 'websocket', 'auto']).default('auto'),
  spokenLanguage: spokenLanguageSchema.default('auto'),
  vocabularyHints: z.array(z.string().max(64)).max(100).default([]),
});
export type TranscriptionTokenRequest = z.infer<typeof transcriptionTokenRequestSchema>;

export const transcriptionTokenResponseSchema = z.object({
  /** Everything the transport needs. Contains a SHORT-LIVED client secret. */
  config: transcriptionConfigSchema,
  /** Signed token authenticating this client on the LingoLive realtime hub. */
  realtimeToken: z.string(),
  realtimeUrl: z.string(),
});
export type TranscriptionTokenResponse = z.infer<typeof transcriptionTokenResponseSchema>;

export const translationTokenRequestSchema = z.object({
  sessionId: z.string(),
  targetLanguages: z.array(languageCodeSchema).min(1).max(12),
});
export type TranslationTokenRequest = z.infer<typeof translationTokenRequestSchema>;

export const translationTokenResponseSchema = z.object({
  realtimeToken: z.string(),
  realtimeUrl: z.string(),
  expiresAt: z.string(),
  targetLanguages: z.array(languageCodeSchema),
});
export type TranslationTokenResponse = z.infer<typeof translationTokenResponseSchema>;

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const createSessionSlotSchema = z.object({
  position: z.number().int().min(0).max(3),
  readingLanguage: languageCodeSchema,
  spokenLanguageHint: spokenLanguageSchema.optional(),
  rotation: rotationSchema,
  displayName: z.string().trim().max(60).optional(),
});

export const createSessionRequestSchema = z
  .object({
    kind: sessionKindSchema,
    title: z.string().trim().max(160).optional(),
    /** LISTEN/BROADCAST reading language. */
    readingLanguage: readingLanguageSchema.optional(),
    /** DISCUSS only. */
    participantCount: discussParticipantCountSchema.optional(),
    slots: z.array(createSessionSlotSchema).max(4).optional(),
  })
  .refine((v) => v.kind !== 'PERSONAL_DISCUSS' || (v.slots?.length ?? 0) >= 2, {
    message: 'A discussion session needs at least two slots',
    path: ['slots'],
  })
  .refine((v) => v.kind !== 'BUSINESS_BROADCAST', {
    message: 'Business broadcast sessions are created by an organizer, not by this endpoint',
    path: ['kind'],
  });
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

export const sessionResponseSchema = z.object({ session: sessionSchema });
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const endSessionRequestSchema = z.object({
  /** Client-measured audio seconds; server reconciles, never trusts blindly. */
  reportedAudioSeconds: z.number().min(0).max(86_400).optional(),
});

export const saveSessionRequestSchema = z.object({
  title: z.string().trim().max(160).optional(),
  /** Explicit, per the privacy-by-default rule. Nothing is saved implicitly. */
  confirmed: z.literal(true),
});
export type SaveSessionRequest = z.infer<typeof saveSessionRequestSchema>;

export const appendSegmentRequestSchema = z.object({
  speakerSlotId: z.string().optional(),
  sourceLanguage: z.string().max(20).optional(),
  originalText: z.string().min(1).max(4000),
  startedAtMs: z.number().int().min(0).optional(),
  endedAtMs: z.number().int().min(0).optional(),
  clientSegmentId: z.string().max(64).optional(),
});
export type AppendSegmentRequest = z.infer<typeof appendSegmentRequestSchema>;

export const segmentsQuerySchema = z.object({
  /** Return only segments strictly after this sequence (reconnection). */
  afterSequence: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  /** Which translation to include, if any. */
  language: readingLanguageSchema.optional(),
});

export const segmentsResponseSchema = z.object({
  segments: z.array(renderedSegmentSchema),
  lastSequence: z.number().int().min(0),
  hasMore: z.boolean(),
});
export type SegmentsResponse = z.infer<typeof segmentsResponseSchema>;

export const appendSegmentResponseSchema = z.object({
  segment: transcriptSegmentSchema,
});

// ---------------------------------------------------------------------------
// LingoBusiness participant flow
// ---------------------------------------------------------------------------

export const businessSessionPreviewSchema = z.object({
  sessionId: z.string(),
  title: z.string(),
  organizerName: z.string(),
  status: z.enum(['PENDING', 'LIVE', 'PAUSED', 'ENDED', 'EXPIRED']),
  /** Languages the organizer already broadcasts; the viewer may add another. */
  availableLanguages: z.array(languageCodeSchema),
  participantCount: z.number().int().min(0),
  startedAt: z.string().nullable(),
});
export type BusinessSessionPreview = z.infer<typeof businessSessionPreviewSchema>;

export const businessJoinRequestSchema = z.object({
  /** Either a plain 6-digit code… */
  code: accessCodeSchema.optional(),
  /** …or a signed deep-link token, which does not expose the code in the URL. */
  joinToken: z.string().min(10).optional(),
  targetLanguage: readingLanguageSchema,
  /** Set for guests; the server issues an ephemeral participant identity. */
  anonymousId: z.string().min(16).max(128).optional(),
  displayName: z.string().trim().max(60).optional(),
}).refine((v) => Boolean(v.code || v.joinToken), {
  message: 'Provide either a code or a joinToken',
  path: ['code'],
});
export type BusinessJoinRequest = z.infer<typeof businessJoinRequestSchema>;

export const businessJoinResponseSchema = z.object({
  session: businessSessionPreviewSchema,
  participantId: z.string(),
  realtimeToken: z.string(),
  realtimeUrl: z.string(),
  targetLanguage: readingLanguageSchema,
  /** Joining is always free — surfaced so clients never show a paywall here. */
  requiresAccount: z.literal(false),
});
export type BusinessJoinResponse = z.infer<typeof businessJoinResponseSchema>;

export const setViewerLanguageRequestSchema = z.object({
  participantId: z.string(),
  targetLanguage: readingLanguageSchema,
});

// ---------------------------------------------------------------------------
// History / usage
// ---------------------------------------------------------------------------

export const historyQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().max(120).optional(),
  kind: sessionKindSchema.optional(),
});

export const historyResponseSchema = z.object({
  items: z.array(sessionSummarySchema),
  nextCursor: z.string().nullable(),
  /** UI groups: today / this week / older. Computed client-side from dates. */
  total: z.number().int().min(0),
});
export type HistoryResponse = z.infer<typeof historyResponseSchema>;

export const renameSessionRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
});

export const usageResponseSchema = z.object({ usage: usageSummarySchema });
export type UsageResponse = z.infer<typeof usageResponseSchema>;

export const exportQuerySchema = z.object({
  format: transcriptExportFormatSchema.default('txt'),
  language: readingLanguageSchema.optional(),
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  version: z.string(),
  environment: z.string(),
  uptimeSeconds: z.number().min(0),
});

export const readyResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  checks: z.object({
    database: z.enum(['ok', 'error']),
    redis: z.enum(['ok', 'degraded', 'error']),
    aiProvider: z.enum(['ok', 'mock', 'not_configured', 'error']),
  }),
});
export type ReadyResponse = z.infer<typeof readyResponseSchema>;

export const configResponseSchema = z.object({
  aiProvider: z.enum(['mock', 'openai']),
  billingProvider: z.enum(['mock', 'stripe', 'revenuecat']),
  authProvider: z.enum(['local', 'oidc']),
  devSimulatorEnabled: z.boolean(),
  maxDiscussionLanguages: z.number().int(),
  maxPersonalSessionMinutes: z.number().int(),
  supportedLocales: z.array(localeSchema),
  deepLinkScheme: z.string(),
  webBaseUrl: z.string(),
  /** Present so clients can show "translation unavailable" honestly. */
  translationAvailable: z.boolean(),
});
export type ConfigResponse = z.infer<typeof configResponseSchema>;
