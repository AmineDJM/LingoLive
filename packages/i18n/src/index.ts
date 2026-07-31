import {
  DEFAULT_LOCALE,
  getLocaleDefinition,
  isRtlLocale,
  localeDirection,
  resolveLocale,
  UI_LOCALES,
  type UiLocale,
} from '@lingolive/contracts';
import { en, type Messages } from './messages/en.js';
import { fr } from './messages/fr.js';
import { ar } from './messages/ar.js';
import { es } from './messages/es.js';
import { ptBR } from './messages/pt-BR.js';
import { it } from './messages/it.js';
import { de } from './messages/de.js';

export type { Messages } from './messages/en.js';
export { en, fr, ar, es, ptBR, it, de };

export const dictionaries: Record<UiLocale, Messages> = {
  en,
  fr,
  ar,
  es,
  'pt-BR': ptBR,
  it,
  de,
};

/**
 * Dot-separated path into the message tree, e.g. `listen.backToLive`.
 * Typed, so a typo is a compile error rather than a `listen.backToLiv` string
 * shown to a user.
 */
export type MessageKey = {
  [Section in keyof Messages]: `${Section & string}.${keyof Messages[Section] & string}`;
}[keyof Messages];

export type InterpolationValues = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

export function interpolate(template: string, values?: InterpolationValues): string {
  if (!values) return template;
  return template.replace(PLACEHOLDER, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

function lookup(messages: Messages, key: string): string | undefined {
  const [section, entry] = key.split('.');
  if (!section || !entry) return undefined;
  const group = (messages as unknown as Record<string, Record<string, string>>)[section];
  return group?.[entry];
}

export interface Translator {
  readonly locale: UiLocale;
  readonly direction: 'ltr' | 'rtl';
  readonly messages: Messages;
  /** Translate a key, interpolating `{placeholders}`. */
  t: (key: MessageKey, values?: InterpolationValues) => string;
  /** Format a duration in seconds as a localised `mm min ss s` string. */
  formatDuration: (seconds: number) => string;
  /** Format `mm:ss` (or `h:mm:ss`) for the live timer. */
  formatClock: (seconds: number) => string;
}

/**
 * Builds a translator for a locale. Missing keys fall back to English rather
 * than rendering the raw key — a partially-shipped translation must never show
 * `settings.deleteAccount` to a user.
 */
export function createTranslator(localeInput: string): Translator {
  const locale = resolveLocale(localeInput);
  const messages = dictionaries[locale] ?? en;
  const direction = localeDirection(locale);

  const t = (key: MessageKey, values?: InterpolationValues): string => {
    const template = lookup(messages, key) ?? lookup(en, key);
    if (template === undefined) {
      // Unreachable for typed callers; keeps runtime-supplied keys safe.
      return key;
    }
    return interpolate(template, values);
  };

  const formatDuration = (seconds: number): string => {
    const total = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(total / 60);
    const remaining = total % 60;
    if (minutes === 0) return t('common.seconds', { count: remaining });
    return t('common.durationMinutesSeconds', { minutes, seconds: remaining });
  };

  const formatClock = (seconds: number): string => {
    const total = Math.max(0, Math.floor(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  return { locale, direction, messages, t, formatDuration, formatClock };
}

export function getMessages(locale: string): Messages {
  return dictionaries[resolveLocale(locale)] ?? en;
}

/**
 * Every key a locale is missing (should always be empty — enforced by tests
 * and by the `Messages` type — but kept as a runtime guard for dictionaries
 * loaded dynamically).
 */
export function findMissingKeys(locale: UiLocale): string[] {
  const target = dictionaries[locale];
  const missing: string[] = [];
  for (const [section, entries] of Object.entries(en)) {
    for (const key of Object.keys(entries)) {
      const value = (target as unknown as Record<string, Record<string, unknown>>)[section]?.[key];
      if (typeof value !== 'string' || value.length === 0) {
        missing.push(`${section}.${key}`);
      }
    }
  }
  return missing;
}

export function allMessageKeys(): string[] {
  const keys: string[] = [];
  for (const [section, entries] of Object.entries(en)) {
    for (const key of Object.keys(entries)) keys.push(`${section}.${key}`);
  }
  return keys;
}

export {
  DEFAULT_LOCALE,
  UI_LOCALES,
  getLocaleDefinition,
  isRtlLocale,
  localeDirection,
  resolveLocale,
};
export type { UiLocale };
