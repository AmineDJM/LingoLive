-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('GUEST', 'FREE', 'PRO', 'BUSINESS_PARTICIPANT');

-- CreateEnum
CREATE TYPE "EntitlementSource" AS ENUM ('DEFAULT', 'STRIPE', 'REVENUECAT', 'MANUAL', 'PROMO');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('system', 'light', 'dark');

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('PERSONAL_LISTEN', 'PERSONAL_DISCUSS', 'BUSINESS_BROADCAST');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PENDING', 'LIVE', 'PAUSED', 'ENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('OWNER', 'SPEAKER_SLOT', 'VIEWER');

-- CreateEnum
CREATE TYPE "UsageMetric" AS ENUM ('AUDIO_SECONDS', 'TRANSLATION_CHARACTERS', 'TRANSLATION_REQUESTS', 'INPUT_TOKENS', 'OUTPUT_TOKENS', 'SESSION_STARTED', 'BUSINESS_VIEWER_MINUTES');

-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('USER_UPDATED', 'USER_SUSPENDED', 'USER_UNSUSPENDED', 'USER_DELETED', 'PLAN_CHANGED', 'SESSION_ENDED', 'SESSION_DELETED', 'TRANSCRIPT_REVEALED', 'CONFIG_OVERRIDDEN', 'ACCESS_CODE_REVOKED', 'BUSINESS_SESSION_CREATED', 'CIRCUIT_BREAKER_TOGGLED', 'DATA_EXPORTED');

-- CreateEnum
CREATE TYPE "DeletionStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "externalAuthId" TEXT,
    "email" TEXT,
    "displayName" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "preferredLocale" TEXT NOT NULL DEFAULT 'en',
    "preferredReadingLanguage" TEXT NOT NULL DEFAULT 'en',
    "theme" "Theme" NOT NULL DEFAULT 'system',
    "transcriptFontScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "hapticsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoSaveTranscripts" BOOLEAN NOT NULL DEFAULT false,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "deletionRequestedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousIdHash" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "source" "EntitlementSource" NOT NULL DEFAULT 'DEFAULT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "externalReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "kind" "SessionKind" NOT NULL,
    "ownerUserId" TEXT,
    "anonymousOwnerHash" TEXT,
    "title" TEXT,
    "organizerName" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'PENDING',
    "readingLanguage" TEXT NOT NULL DEFAULT 'original',
    "sourceLanguage" TEXT DEFAULT 'auto',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "saveRequested" BOOLEAN NOT NULL DEFAULT false,
    "audioStored" BOOLEAN NOT NULL DEFAULT false,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speaker_slots" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "displayName" TEXT,
    "readingLanguage" TEXT NOT NULL,
    "spokenLanguageHint" TEXT DEFAULT 'auto',
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speaker_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousHash" TEXT,
    "role" "ParticipantRole" NOT NULL,
    "displayName" TEXT,
    "targetLanguage" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "lastSequenceReceived" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_segments" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "speakerSlotId" TEXT,
    "sequence" INTEGER NOT NULL,
    "sourceLanguage" TEXT,
    "originalTextEncrypted" TEXT NOT NULL,
    "encryptionVersion" INTEGER NOT NULL DEFAULT 1,
    "characterCount" INTEGER NOT NULL DEFAULT 0,
    "startedAtMs" INTEGER,
    "endedAtMs" INTEGER,
    "clientSegmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translations" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "translatedTextEncrypted" TEXT NOT NULL,
    "encryptionVersion" INTEGER NOT NULL DEFAULT 1,
    "characterCount" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_access_codes" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxParticipants" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_access_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousHash" TEXT,
    "sessionId" TEXT,
    "metric" "UsageMetric" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "model" TEXT,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorEmail" TEXT,
    "action" "AdminAuditAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_overrides" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_overrides_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousHash" TEXT,
    "platform" TEXT,
    "locale" TEXT,
    "sessionKind" TEXT,
    "participantCount" INTEGER,
    "targetLanguageCount" INTEGER,
    "durationSeconds" INTEGER,
    "plan" TEXT,
    "success" BOOLEAN,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DeletionStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "deletedSessions" INTEGER NOT NULL DEFAULT 0,
    "deletedSegments" INTEGER NOT NULL DEFAULT 0,
    "deletedTranslations" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_events" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "route" TEXT,
    "method" TEXT,
    "status" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_externalAuthId_key" ON "users"("externalAuthId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "devices_anonymousIdHash_key" ON "devices"("anonymousIdHash");

-- CreateIndex
CREATE INDEX "devices_userId_idx" ON "devices"("userId");

-- CreateIndex
CREATE INDEX "devices_lastSeenAt_idx" ON "devices"("lastSeenAt");

-- CreateIndex
CREATE INDEX "entitlements_userId_active_idx" ON "entitlements"("userId", "active");

-- CreateIndex
CREATE INDEX "sessions_ownerUserId_startedAt_idx" ON "sessions"("ownerUserId", "startedAt");

-- CreateIndex
CREATE INDEX "sessions_anonymousOwnerHash_startedAt_idx" ON "sessions"("anonymousOwnerHash", "startedAt");

-- CreateIndex
CREATE INDEX "sessions_status_kind_idx" ON "sessions"("status", "kind");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "sessions_saveRequested_endedAt_idx" ON "sessions"("saveRequested", "endedAt");

-- CreateIndex
CREATE INDEX "speaker_slots_sessionId_idx" ON "speaker_slots"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "speaker_slots_sessionId_position_key" ON "speaker_slots"("sessionId", "position");

-- CreateIndex
CREATE INDEX "participants_sessionId_leftAt_idx" ON "participants"("sessionId", "leftAt");

-- CreateIndex
CREATE INDEX "participants_userId_idx" ON "participants"("userId");

-- CreateIndex
CREATE INDEX "transcript_segments_sessionId_createdAt_idx" ON "transcript_segments"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "transcript_segments_sessionId_sequence_key" ON "transcript_segments"("sessionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "transcript_segments_sessionId_clientSegmentId_key" ON "transcript_segments"("sessionId", "clientSegmentId");

-- CreateIndex
CREATE INDEX "translations_targetLanguage_idx" ON "translations"("targetLanguage");

-- CreateIndex
CREATE UNIQUE INDEX "translations_segmentId_targetLanguage_key" ON "translations"("segmentId", "targetLanguage");

-- CreateIndex
CREATE UNIQUE INDEX "business_access_codes_codeHash_key" ON "business_access_codes"("codeHash");

-- CreateIndex
CREATE INDEX "business_access_codes_sessionId_idx" ON "business_access_codes"("sessionId");

-- CreateIndex
CREATE INDEX "business_access_codes_active_expiresAt_idx" ON "business_access_codes"("active", "expiresAt");

-- CreateIndex
CREATE INDEX "usage_ledger_userId_createdAt_idx" ON "usage_ledger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_ledger_anonymousHash_createdAt_idx" ON "usage_ledger"("anonymousHash", "createdAt");

-- CreateIndex
CREATE INDEX "usage_ledger_sessionId_idx" ON "usage_ledger"("sessionId");

-- CreateIndex
CREATE INDEX "usage_ledger_metric_createdAt_idx" ON "usage_ledger"("metric", "createdAt");

-- CreateIndex
CREATE INDEX "usage_ledger_createdAt_idx" ON "usage_ledger"("createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_log_actorUserId_createdAt_idx" ON "admin_audit_log"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_log_action_createdAt_idx" ON "admin_audit_log"("action", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_log_targetId_idx" ON "admin_audit_log"("targetId");

-- CreateIndex
CREATE INDEX "analytics_events_name_createdAt_idx" ON "analytics_events"("name", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_createdAt_idx" ON "analytics_events"("createdAt");

-- CreateIndex
CREATE INDEX "deletion_requests_status_scheduledFor_idx" ON "deletion_requests"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "deletion_requests_userId_idx" ON "deletion_requests"("userId");

-- CreateIndex
CREATE INDEX "error_events_createdAt_idx" ON "error_events"("createdAt");

-- CreateIndex
CREATE INDEX "error_events_code_createdAt_idx" ON "error_events"("code", "createdAt");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaker_slots" ADD CONSTRAINT "speaker_slots_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_speakerSlotId_fkey" FOREIGN KEY ("speakerSlotId") REFERENCES "speaker_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translations" ADD CONSTRAINT "translations_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "transcript_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_access_codes" ADD CONSTRAINT "business_access_codes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
