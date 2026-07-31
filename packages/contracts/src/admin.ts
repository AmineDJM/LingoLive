import { z } from 'zod';
import { planSchema, usageMetricSchema } from './entitlements.js';
import { sessionKindSchema, sessionStatusSchema } from './session.js';
import { localeSchema } from './locales.js';

/**
 * Admin ("operator") surface.
 *
 * Design rule: an operator can observe **everything** about how the system is
 * running — every account, device, session, connection, cost, error, latency
 * percentile and configuration value — and can act on all of it.
 *
 * One thing is deliberately NOT frictionless: reading the content of a user's
 * transcript. That requires an explicit reason, is rate-limited, and is
 * written to an immutable audit trail that the operator cannot delete. Total
 * visibility over the *system* does not mean silent surveillance of *people*.
 */

export const ADMIN_PERMISSIONS = [
  'admin:read',
  'admin:users:write',
  'admin:sessions:write',
  'admin:config:write',
  'admin:transcripts:reveal',
  'admin:billing:write',
  'admin:danger',
] as const;
export const adminPermissionSchema = z.enum(ADMIN_PERMISSIONS);
export type AdminPermission = z.infer<typeof adminPermissionSchema>;

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export const adminOverviewSchema = z.object({
  generatedAt: z.string(),
  live: z.object({
    activeSessions: z.number().int().min(0),
    activeListenSessions: z.number().int().min(0),
    activeDiscussSessions: z.number().int().min(0),
    activeBroadcastSessions: z.number().int().min(0),
    connectedClients: z.number().int().min(0),
    businessViewers: z.number().int().min(0),
    speakingNow: z.number().int().min(0),
  }),
  today: z.object({
    sessionsStarted: z.number().int().min(0),
    audioMinutes: z.number().min(0),
    segments: z.number().int().min(0),
    translations: z.number().int().min(0),
    uniqueUsers: z.number().int().min(0),
    newUsers: z.number().int().min(0),
    estimatedCostUsd: z.number().min(0),
    errors: z.number().int().min(0),
  }),
  totals: z.object({
    users: z.number().int().min(0),
    guests: z.number().int().min(0),
    devices: z.number().int().min(0),
    sessions: z.number().int().min(0),
    savedSessions: z.number().int().min(0),
    segments: z.number().int().min(0),
    translations: z.number().int().min(0),
    proSubscribers: z.number().int().min(0),
  }),
  health: z.object({
    database: z.enum(['ok', 'degraded', 'error']),
    redis: z.enum(['ok', 'degraded', 'error']),
    aiProvider: z.enum(['ok', 'mock', 'not_configured', 'error']),
    worker: z.enum(['ok', 'stale', 'unknown']),
    costCircuitBreaker: z.enum(['closed', 'open']),
  }),
  process: z.object({
    version: z.string(),
    environment: z.string(),
    uptimeSeconds: z.number().min(0),
    rssBytes: z.number().min(0),
    heapUsedBytes: z.number().min(0),
    eventLoopDelayP99Ms: z.number().min(0),
    nodeVersion: z.string(),
  }),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const adminUserListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  plan: planSchema.optional(),
  isGuest: z.coerce.boolean().optional(),
  isAdmin: z.coerce.boolean().optional(),
  deleted: z.coerce.boolean().optional(),
  sort: z.enum(['createdAt', 'lastSeenAt', 'audioSeconds', 'sessions']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const adminUserRowSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  isGuest: z.boolean(),
  isAdmin: z.boolean(),
  plan: planSchema,
  preferredLocale: localeSchema,
  preferredReadingLanguage: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  deletionRequestedAt: z.string().nullable(),
  suspendedAt: z.string().nullable(),
  sessionCount: z.number().int().min(0),
  audioSeconds: z.number().min(0),
  deviceCount: z.number().int().min(0),
  estimatedCostUsd: z.number().min(0),
});
export type AdminUserRow = z.infer<typeof adminUserRowSchema>;

export const adminUserListResponseSchema = z.object({
  items: z.array(adminUserRowSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().min(0),
});

export const adminDeviceSchema = z.object({
  id: z.string(),
  platform: z.string(),
  appVersion: z.string().nullable(),
  anonymousIdPreview: z.string(),
  locale: z.string().nullable(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
});

export const adminUserDetailSchema = z.object({
  user: adminUserRowSchema,
  devices: z.array(adminDeviceSchema),
  entitlements: z.array(
    z.object({
      id: z.string(),
      plan: planSchema,
      source: z.string(),
      active: z.boolean(),
      expiresAt: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
  usageByMetric: z.array(
    z.object({
      metric: usageMetricSchema,
      quantity: z.number().min(0),
      provider: z.string(),
      model: z.string().nullable(),
    }),
  ),
  recentSessions: z.array(
    z.object({
      id: z.string(),
      kind: sessionKindSchema,
      status: sessionStatusSchema,
      title: z.string().nullable(),
      startedAt: z.string(),
      durationSeconds: z.number().int().min(0),
      segmentCount: z.number().int().min(0),
      saved: z.boolean(),
    }),
  ),
  monthlyUsage: z.array(
    z.object({ month: z.string(), audioSeconds: z.number().min(0), sessions: z.number().int() }),
  ),
});
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

export const adminUpdateUserRequestSchema = z
  .object({
    plan: planSchema.optional(),
    planExpiresAt: z.string().nullable().optional(),
    isAdmin: z.boolean().optional(),
    suspended: z.boolean().optional(),
    displayName: z.string().trim().max(60).nullable().optional(),
    /** Free-form note attached to the audit entry. */
    reason: z.string().trim().min(3).max(500),
  })
  .refine((v) => Object.keys(v).length > 1, { message: 'Nothing to update' });
export type AdminUpdateUserRequest = z.infer<typeof adminUpdateUserRequestSchema>;

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const adminSessionListQuerySchema = z.object({
  status: sessionStatusSchema.optional(),
  kind: sessionKindSchema.optional(),
  userId: z.string().optional(),
  liveOnly: z.coerce.boolean().optional(),
  since: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const adminSessionRowSchema = z.object({
  id: z.string(),
  kind: sessionKindSchema,
  status: sessionStatusSchema,
  title: z.string().nullable(),
  ownerUserId: z.string().nullable(),
  ownerEmail: z.string().nullable(),
  anonymousOwnerPreview: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationSeconds: z.number().int().min(0),
  segmentCount: z.number().int().min(0),
  translationCount: z.number().int().min(0),
  participantCount: z.number().int().min(0),
  connectedNow: z.number().int().min(0),
  languages: z.array(z.string()),
  saved: z.boolean(),
  estimatedCostUsd: z.number().min(0),
});
export type AdminSessionRow = z.infer<typeof adminSessionRowSchema>;

export const adminSessionListResponseSchema = z.object({
  items: z.array(adminSessionRowSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().min(0),
});

export const adminSessionDetailSchema = z.object({
  session: adminSessionRowSchema,
  slots: z.array(
    z.object({
      id: z.string(),
      position: z.number().int(),
      readingLanguage: z.string(),
      spokenLanguageHint: z.string().nullable(),
      rotation: z.number().int(),
      displayName: z.string().nullable(),
    }),
  ),
  participants: z.array(
    z.object({
      id: z.string(),
      role: z.string(),
      targetLanguage: z.string().nullable(),
      joinedAt: z.string(),
      leftAt: z.string().nullable(),
      lastSequenceReceived: z.number().int(),
      connected: z.boolean(),
    }),
  ),
  usage: z.array(
    z.object({
      metric: usageMetricSchema,
      quantity: z.number().min(0),
      provider: z.string(),
      model: z.string().nullable(),
    }),
  ),
  timings: z.object({
    firstSegmentAtMs: z.number().nullable(),
    lastSegmentAtMs: z.number().nullable(),
    medianSegmentGapMs: z.number().nullable(),
  }),
  /**
   * Metadata only. Text is `null` unless the operator explicitly revealed it
   * with `admin:transcripts:reveal` and a recorded reason.
   */
  segments: z.array(
    z.object({
      id: z.string(),
      sequence: z.number().int(),
      sourceLanguage: z.string().nullable(),
      characterCount: z.number().int().min(0),
      createdAt: z.string(),
      translationLanguages: z.array(z.string()),
      originalText: z.string().nullable(),
    }),
  ),
  transcriptRevealed: z.boolean(),
});
export type AdminSessionDetail = z.infer<typeof adminSessionDetailSchema>;

export const adminRevealTranscriptRequestSchema = z.object({
  /** Recorded verbatim in the immutable audit log. Required. */
  reason: z.string().trim().min(10).max(500),
});

export const adminEndSessionRequestSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

// ---------------------------------------------------------------------------
// Cost & usage analytics
// ---------------------------------------------------------------------------

export const adminUsageQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  granularity: z.enum(['hour', 'day', 'month']).default('day'),
});

export const adminUsageResponseSchema = z.object({
  buckets: z.array(
    z.object({
      bucket: z.string(),
      audioSeconds: z.number().min(0),
      translationRequests: z.number().int().min(0),
      translationCharacters: z.number().int().min(0),
      inputTokens: z.number().int().min(0),
      outputTokens: z.number().int().min(0),
      sessions: z.number().int().min(0),
      estimatedCostUsd: z.number().min(0),
    }),
  ),
  byModel: z.array(
    z.object({
      provider: z.string(),
      model: z.string(),
      quantity: z.number().min(0),
      metric: usageMetricSchema,
      estimatedCostUsd: z.number().min(0),
    }),
  ),
  byLanguage: z.array(
    z.object({ language: z.string(), translations: z.number().int().min(0) }),
  ),
  limits: z.object({
    dailyLimitUsd: z.number().min(0),
    monthlyLimitUsd: z.number().min(0),
    spentTodayUsd: z.number().min(0),
    spentThisMonthUsd: z.number().min(0),
    circuitBreakerOpen: z.boolean(),
  }),
});
export type AdminUsageResponse = z.infer<typeof adminUsageResponseSchema>;

// ---------------------------------------------------------------------------
// Realtime inspection
// ---------------------------------------------------------------------------

export const adminRealtimeResponseSchema = z.object({
  connections: z.array(
    z.object({
      connectionId: z.string(),
      sessionId: z.string(),
      participantId: z.string(),
      role: z.string(),
      targetLanguage: z.string().nullable(),
      connectedAt: z.string(),
      lastHeartbeatAt: z.string(),
      lastSequenceSent: z.number().int(),
      messagesSent: z.number().int(),
      messagesReceived: z.number().int(),
      /** Truncated to a /24 (IPv4) or /48 (IPv6) — never a full address. */
      networkPrefix: z.string().nullable(),
    }),
  ),
  rooms: z.array(
    z.object({
      sessionId: z.string(),
      kind: sessionKindSchema,
      subscribers: z.number().int().min(0),
      activeLanguages: z.array(z.string()),
      /** Fan-out ratio: viewers served per translation actually performed. */
      fanOutRatio: z.number().min(0),
      lastSequence: z.number().int().min(0),
    }),
  ),
  totals: z.object({
    connections: z.number().int().min(0),
    rooms: z.number().int().min(0),
    messagesPerMinute: z.number().min(0),
  }),
});
export type AdminRealtimeResponse = z.infer<typeof adminRealtimeResponseSchema>;

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

export const adminMetricsResponseSchema = z.object({
  latency: z.array(
    z.object({
      name: z.string(),
      count: z.number().int().min(0),
      p50Ms: z.number().min(0),
      p95Ms: z.number().min(0),
      p99Ms: z.number().min(0),
      maxMs: z.number().min(0),
    }),
  ),
  counters: z.array(z.object({ name: z.string(), value: z.number() })),
  http: z.array(
    z.object({
      route: z.string(),
      method: z.string(),
      count: z.number().int().min(0),
      errorCount: z.number().int().min(0),
      p95Ms: z.number().min(0),
    }),
  ),
  recentErrors: z.array(
    z.object({
      at: z.string(),
      requestId: z.string(),
      code: z.string(),
      route: z.string().nullable(),
      message: z.string(),
      count: z.number().int().min(1),
    }),
  ),
});
export type AdminMetricsResponse = z.infer<typeof adminMetricsResponseSchema>;

// ---------------------------------------------------------------------------
// Runtime configuration
// ---------------------------------------------------------------------------

export const adminConfigResponseSchema = z.object({
  /** Effective values, with secrets replaced by a presence flag. */
  runtime: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
      source: z.enum(['env', 'override', 'default']),
      secret: z.boolean(),
      editable: z.boolean(),
    }),
  ),
  overrides: z.record(z.string(), z.string()),
  featureFlags: z.record(z.string(), z.boolean()),
});
export type AdminConfigResponse = z.infer<typeof adminConfigResponseSchema>;

export const adminUpdateConfigRequestSchema = z.object({
  key: z.string().min(1).max(80),
  /** `null` removes the override and restores the environment value. */
  value: z.string().max(400).nullable(),
  reason: z.string().trim().min(3).max(500),
});
export type AdminUpdateConfigRequest = z.infer<typeof adminUpdateConfigRequestSchema>;

// ---------------------------------------------------------------------------
// Business access codes
// ---------------------------------------------------------------------------

export const adminAccessCodeSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  sessionTitle: z.string().nullable(),
  active: z.boolean(),
  expiresAt: z.string(),
  maxParticipants: z.number().int().nullable(),
  usedCount: z.number().int().min(0),
  createdAt: z.string(),
});

export const adminCreateBusinessSessionRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  organizerName: z.string().trim().min(1).max(160),
  sourceLanguage: z.string().max(20).default('auto'),
  targetLanguages: z.array(z.string().max(20)).min(1).max(12),
  maxParticipants: z.number().int().min(1).max(100_000).optional(),
  expiresInHours: z.number().int().min(1).max(168).default(24),
});
export type AdminCreateBusinessSessionRequest = z.infer<
  typeof adminCreateBusinessSessionRequestSchema
>;

export const adminCreateBusinessSessionResponseSchema = z.object({
  sessionId: z.string(),
  /** Shown exactly once, at creation time. Only a hash is stored. */
  code: z.string(),
  joinUrl: z.string(),
  deepLink: z.string(),
  organizerToken: z.string(),
  realtimeUrl: z.string(),
  expiresAt: z.string(),
});
export type AdminCreateBusinessSessionResponse = z.infer<
  typeof adminCreateBusinessSessionResponseSchema
>;

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export const ADMIN_AUDIT_ACTIONS = [
  'USER_UPDATED',
  'USER_SUSPENDED',
  'USER_UNSUSPENDED',
  'USER_DELETED',
  'PLAN_CHANGED',
  'SESSION_ENDED',
  'SESSION_DELETED',
  'TRANSCRIPT_REVEALED',
  'CONFIG_OVERRIDDEN',
  'ACCESS_CODE_REVOKED',
  'BUSINESS_SESSION_CREATED',
  'CIRCUIT_BREAKER_TOGGLED',
  'DATA_EXPORTED',
] as const;
export const adminAuditActionSchema = z.enum(ADMIN_AUDIT_ACTIONS);
export type AdminAuditAction = z.infer<typeof adminAuditActionSchema>;

export const adminAuditEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  actorUserId: z.string(),
  actorEmail: z.string().nullable(),
  action: adminAuditActionSchema,
  targetType: z.string(),
  targetId: z.string(),
  reason: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  requestId: z.string(),
});
export type AdminAuditEntry = z.infer<typeof adminAuditEntrySchema>;

export const adminAuditQuerySchema = z.object({
  action: adminAuditActionSchema.optional(),
  actorUserId: z.string().optional(),
  targetId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const adminAuditResponseSchema = z.object({
  items: z.array(adminAuditEntrySchema),
  nextCursor: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Analytics events (content-free by construction)
// ---------------------------------------------------------------------------

export const ANALYTICS_EVENTS = [
  'onboarding_completed',
  'listen_started',
  'listen_ended',
  'discuss_started',
  'speaker_turn_started',
  'speaker_turn_completed',
  'business_join_succeeded',
  'business_join_failed',
  'transcript_saved',
  'paywall_viewed',
  'subscription_started',
] as const;
export const analyticsEventSchema = z.enum(ANALYTICS_EVENTS);
export type AnalyticsEventName = z.infer<typeof analyticsEventSchema>;

/**
 * Analytics properties are a closed set of primitives. There is no free-form
 * string field, which makes it structurally impossible to leak spoken content
 * into the analytics pipeline.
 */
export const analyticsPropertiesSchema = z.object({
  platform: z.enum(['ios', 'android', 'web', 'unknown']).optional(),
  locale: z.string().max(20).optional(),
  sessionKind: sessionKindSchema.optional(),
  participantCount: z.number().int().min(0).max(4).optional(),
  targetLanguageCount: z.number().int().min(0).max(20).optional(),
  durationSeconds: z.number().int().min(0).optional(),
  plan: planSchema.optional(),
  success: z.boolean().optional(),
  errorCode: z.string().max(60).optional(),
});
export type AnalyticsProperties = z.infer<typeof analyticsPropertiesSchema>;

export const analyticsIngestRequestSchema = z.object({
  events: z
    .array(
      z.object({
        name: analyticsEventSchema,
        at: z.string(),
        properties: analyticsPropertiesSchema.default({}),
      }),
    )
    .min(1)
    .max(50),
});

export const adminAnalyticsResponseSchema = z.object({
  events: z.array(
    z.object({
      name: analyticsEventSchema,
      count: z.number().int().min(0),
      uniqueActors: z.number().int().min(0),
    }),
  ),
  funnel: z.array(z.object({ step: z.string(), count: z.number().int().min(0) })),
  byDay: z.array(
    z.object({ day: z.string(), counts: z.record(z.string(), z.number().int().min(0)) }),
  ),
});
export type AdminAnalyticsResponse = z.infer<typeof adminAnalyticsResponseSchema>;
