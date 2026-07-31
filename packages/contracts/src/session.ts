import { z } from 'zod';
import { languageCodeSchema, readingLanguageSchema, spokenLanguageSchema } from './languages.js';

/**
 * Three session kinds cover the whole product. There are deliberately no
 * sub-modes ("conference", "meeting", "bar"…): LISTEN covers every ambient
 * situation, DISCUSS covers table conversations, BROADCAST covers a
 * LingoBusiness room the user joins as a viewer.
 */
export const SESSION_KINDS = [
  'PERSONAL_LISTEN',
  'PERSONAL_DISCUSS',
  'BUSINESS_BROADCAST',
] as const;
export const sessionKindSchema = z.enum(SESSION_KINDS);
export type SessionKind = z.infer<typeof sessionKindSchema>;

export const SESSION_STATUSES = ['PENDING', 'LIVE', 'PAUSED', 'ENDED', 'EXPIRED'] as const;
export const sessionStatusSchema = z.enum(SESSION_STATUSES);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const PARTICIPANT_ROLES = ['OWNER', 'SPEAKER_SLOT', 'VIEWER'] as const;
export const participantRoleSchema = z.enum(PARTICIPANT_ROLES);
export type ParticipantRole = z.infer<typeof participantRoleSchema>;

/** Physical orientation of a discussion tile around a table, in degrees. */
export const ROTATIONS = [0, 90, 180, 270] as const;
export const rotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);
export type Rotation = z.infer<typeof rotationSchema>;

export function rotateClockwise(current: Rotation): Rotation {
  const next = (current + 90) % 360;
  return next as Rotation;
}

/** Number of people sharing one device in DISCUSS mode. */
export const discussParticipantCountSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type DiscussParticipantCount = z.infer<typeof discussParticipantCountSchema>;

/**
 * Default physical layout for N people around one device.
 * The rotations describe where each person is *sitting*, so their text reads
 * upright from their own side of the table.
 */
export function defaultRotationsFor(count: DiscussParticipantCount): Rotation[] {
  switch (count) {
    case 2:
      return [0, 180];
    case 3:
      return [0, 90, 270];
    case 4:
      return [0, 90, 180, 270];
  }
}

export const speakerSlotSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  /** 0-based index; also the tile's position in the layout. */
  position: z.number().int().min(0).max(3),
  displayName: z.string().max(60).nullable(),
  /** Language this person wants to READ in. */
  readingLanguage: languageCodeSchema,
  /** Optional hint about what they SPEAK; `auto` lets the model decide. */
  spokenLanguageHint: spokenLanguageSchema.nullable(),
  rotation: rotationSchema,
});
export type SpeakerSlot = z.infer<typeof speakerSlotSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  kind: sessionKindSchema,
  status: sessionStatusSchema,
  title: z.string().max(160).nullable(),
  organizerName: z.string().max(160).nullable(),
  /** Reading language for LISTEN / BROADCAST modes. */
  readingLanguage: readingLanguageSchema,
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  saveRequested: z.boolean(),
  /** Always false. Present so clients can assert it and show it to the user. */
  audioStored: z.literal(false),
  durationSeconds: z.number().int().min(0),
  segmentCount: z.number().int().min(0),
  slots: z.array(speakerSlotSchema),
});
export type Session = z.infer<typeof sessionSchema>;

export const sessionSummarySchema = z.object({
  id: z.string(),
  kind: sessionKindSchema,
  status: sessionStatusSchema,
  title: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationSeconds: z.number().int().min(0),
  segmentCount: z.number().int().min(0),
  languages: z.array(z.string()),
  /** First ~140 characters of the transcript, decrypted server-side. */
  preview: z.string(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

/** A 6-digit LingoBusiness room code. Never stored in clear on the server. */
export const accessCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{6}$/, 'Access code must be exactly 6 digits');

export function normalizeAccessCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 6);
}
