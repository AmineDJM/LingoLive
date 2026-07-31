/**
 * The analytics event catalogue.
 *
 * This file is the *entire* list of things LingoLive is allowed to measure.
 * Analytics that accepts arbitrary payloads eventually ships a transcript to a
 * third party — not maliciously, just by someone adding `{ text }` to a debug
 * event. So the catalogue is closed: an event name that is not here is
 * rejected at runtime, and a property that is not declared here is dropped.
 *
 * Every property below is a count, a duration, an enum or a language code.
 * There is no free-text property in this file, and `analytics.test.ts` fails
 * if one is introduced.
 */

/** Property values we allow. Deliberately not `string` — see below. */
export type AnalyticsValue = number | boolean | string;

export interface AnalyticsEventDefinition {
  /** Human explanation, surfaced in docs/PRIVACY.md. */
  readonly purpose: string;
  /** Allowed property names. Anything else is dropped before transport. */
  readonly properties: readonly string[];
}

/**
 * Property names that are permitted to hold a string. Each one is an
 * identifier, an enum or a BCP-47 language tag — never spoken content.
 */
export const ENUM_PROPERTIES = [
  'action',
  'appEnv',
  'errorCode',
  'kind',
  'layout',
  'locale',
  'platform',
  'readingLanguage',
  'result',
  'role',
  'screen',
  'sourceLanguage',
  'surface',
  'targetLanguage',
  'transport',
] as const;

export const ANALYTICS_EVENTS = {
  app_opened: {
    purpose: 'Daily/weekly active usage.',
    properties: ['platform', 'appEnv', 'locale'],
  },
  onboarding_completed: {
    purpose: 'Whether the value-first onboarding actually converts.',
    properties: ['platform', 'locale', 'stepCount'],
  },
  session_started: {
    purpose: 'Which of the three actions people use.',
    properties: ['kind', 'platform', 'readingLanguage', 'sourceLanguage', 'transport'],
  },
  session_ended: {
    purpose: 'Session length distribution, for capacity and pricing.',
    properties: ['kind', 'platform', 'durationSeconds', 'segmentCount', 'result'],
  },
  discussion_layout_changed: {
    purpose: 'How many people actually sit around one device.',
    properties: ['layout', 'participantCount'],
  },
  tile_rotated: {
    purpose: 'Whether the rotation affordance is discovered.',
    properties: ['layout'],
  },
  language_changed: {
    purpose: 'Language pair demand, to prioritise quality work.',
    properties: ['surface', 'readingLanguage', 'targetLanguage'],
  },
  join_attempted: {
    purpose: 'Which join path is used: QR, code or link.',
    properties: ['action', 'result', 'errorCode'],
  },
  transcript_saved: {
    purpose: 'How often people opt in to keeping a transcript.',
    properties: ['kind', 'segmentCount'],
  },
  permission_result: {
    purpose: 'Microphone/camera permission funnel.',
    properties: ['kind', 'result', 'platform'],
  },
  quota_blocked: {
    purpose: 'How often free limits are the reason a session stops.',
    properties: ['role', 'kind'],
  },
  error_shown: {
    purpose: 'User-visible failures, by code only.',
    properties: ['errorCode', 'screen', 'platform'],
  },
  account_deleted: {
    purpose: 'Deletion requests actually completing.',
    properties: ['platform'],
  },
} as const satisfies Record<string, AnalyticsEventDefinition>;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS;

export function isAnalyticsEvent(name: string): name is AnalyticsEventName {
  return Object.hasOwn(ANALYTICS_EVENTS, name);
}

/**
 * Removes every property that is not declared for the event, and every string
 * value on a property that is not an enum property.
 *
 * The second rule is the important one: it means that even a declared property
 * cannot be repurposed to carry a sentence.
 */
export function sanitizeProperties(
  name: AnalyticsEventName,
  properties: Readonly<Record<string, unknown>> = {},
): Record<string, AnalyticsValue> {
  const allowed = new Set<string>(ANALYTICS_EVENTS[name].properties);
  const enumProperties = new Set<string>(ENUM_PROPERTIES);
  const output: Record<string, AnalyticsValue> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (!allowed.has(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) {
      output[key] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      output[key] = value;
      continue;
    }
    if (typeof value === 'string' && enumProperties.has(key)) {
      // A language tag is at most a handful of characters; anything longer is
      // not a language tag, whatever the property is called.
      if (value.length <= 40 && !/\s{2,}/.test(value)) output[key] = value;
    }
  }

  return output;
}
