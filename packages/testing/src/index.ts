import type { RenderedSegment, TranscriptSegment, Translation } from '@lingolive/contracts';

/**
 * @lingolive/testing — deterministic fixtures shared by unit, integration and
 * end-to-end tests, plus the store screenshot scripts.
 *
 * All speech fixtures are written for this project. Nothing here is recorded
 * from a real person or copied from third-party content.
 */

export interface SpeechFixture {
  readonly id: string;
  readonly language: string;
  readonly direction: 'ltr' | 'rtl';
  readonly text: string;
  /** What the fixture is designed to exercise. */
  readonly exercises: readonly string[];
  readonly translations: Readonly<Record<string, string>>;
}

export const SPEECH_FIXTURES: readonly SpeechFixture[] = [
  {
    id: 'fr-quarterly-results',
    language: 'fr',
    direction: 'ltr',
    text: 'Nous allons maintenant présenter les résultats du troisième trimestre.',
    exercises: ['accents', 'business vocabulary'],
    translations: {
      en: 'We will now present the third-quarter results.',
      ar: 'سنعرض الآن نتائج الربع الثالث.',
      'pt-BR': 'Vamos agora apresentar os resultados do terceiro trimestre.',
      de: 'Wir stellen nun die Ergebnisse des dritten Quartals vor.',
    },
  },
  {
    id: 'fr-numbers',
    language: 'fr',
    direction: 'ltr',
    text: 'Le chiffre d’affaires a progressé de douze pour cent, soit 3,4 millions d’euros.',
    exercises: ['numbers', 'decimal separator', 'currency'],
    translations: {
      en: 'Revenue grew by twelve percent, or 3.4 million euros.',
      ar: 'ارتفعت الإيرادات بنسبة اثني عشر بالمئة، أي 3.4 مليون يورو.',
    },
  },
  {
    id: 'en-proper-nouns',
    language: 'en',
    direction: 'ltr',
    text: 'Amine will present the LingoLive roadmap in São Paulo on March 15th.',
    exercises: ['proper nouns', 'diacritics', 'dates'],
    translations: {
      fr: 'Amine présentera la feuille de route LingoLive à São Paulo le 15 mars.',
      'pt-BR': 'Amine vai apresentar o roteiro do LingoLive em São Paulo no dia 15 de março.',
    },
  },
  {
    id: 'ar-greeting',
    language: 'ar',
    direction: 'rtl',
    text: 'أهلاً بالجميع، سنبدأ الجلسة الآن.',
    exercises: ['rtl', 'arabic script'],
    translations: {
      fr: 'Bienvenue à tous, nous allons commencer la session.',
      en: 'Welcome everyone, we will start the session now.',
    },
  },
  {
    id: 'ar-mixed-digits',
    language: 'ar',
    direction: 'rtl',
    text: 'الاجتماع في الساعة 14:30 في القاعة B.',
    exercises: ['rtl', 'bidi digits', 'latin letter inside rtl'],
    translations: {
      fr: 'La réunion est à 14h30 dans la salle B.',
      en: 'The meeting is at 14:30 in room B.',
    },
  },
  {
    id: 'pt-question',
    language: 'pt-BR',
    direction: 'ltr',
    text: 'Onde fica a estação de trem mais próxima?',
    exercises: ['travel', 'question mark'],
    translations: {
      fr: 'Où se trouve la gare la plus proche ?',
      en: 'Where is the nearest train station?',
    },
  },
  {
    id: 'noisy-partial',
    language: 'en',
    direction: 'ltr',
    text: 'Sorry, could you repeat that? It is very loud in here.',
    exercises: ['noisy environment', 'short utterance'],
    translations: {
      fr: 'Désolé, pouvez-vous répéter ? Il y a beaucoup de bruit ici.',
    },
  },
  {
    id: 'language-switch',
    language: 'fr',
    direction: 'ltr',
    text: 'On continue en anglais: thank you for your patience.',
    exercises: ['mid-utterance language switch'],
    translations: {
      en: 'We will continue in English: thank you for your patience.',
    },
  },
];

export function fixturesForLanguage(language: string): SpeechFixture[] {
  return SPEECH_FIXTURES.filter((f) => f.language === language);
}

export function rtlFixtures(): SpeechFixture[] {
  return SPEECH_FIXTURES.filter((f) => f.direction === 'rtl');
}

let sequenceCounter = 0;

export function makeSegment(overrides: Partial<TranscriptSegment> = {}): TranscriptSegment {
  sequenceCounter += 1;
  return {
    id: `seg_${sequenceCounter}`,
    sessionId: 'ses_test',
    speakerSlotId: null,
    sourceLanguage: 'fr',
    originalText: 'Bonjour à tous.',
    startedAtMs: 0,
    endedAtMs: 1500,
    isFinal: true,
    sequence: sequenceCounter,
    ...overrides,
  };
}

export function makeTranslation(
  segmentId: string,
  targetLanguage: string,
  text: string,
): Translation {
  return {
    segmentId,
    targetLanguage,
    translatedText: text,
    model: 'mock',
    isProvisional: false,
  };
}

/** A short conversation ready to hydrate a TranscriptStore or a UI test. */
export function makeConversation(targetLanguage = 'en'): RenderedSegment[] {
  return SPEECH_FIXTURES.slice(0, 4).map((fixture, index) => {
    const segment = makeSegment({
      id: fixture.id,
      sequence: index + 1,
      sourceLanguage: fixture.language,
      originalText: fixture.text,
      speakerSlotId: `tile-${index % 2}`,
    });
    const translated = fixture.translations[targetLanguage];
    return {
      segment,
      translations: translated ? [makeTranslation(segment.id, targetLanguage, translated)] : [],
    };
  });
}

export function resetFixtureCounter(): void {
  sequenceCounter = 0;
}

/**
 * Synthetic PCM16 audio. Generated, never recorded — used to exercise chunking
 * and buffer bounds without shipping any real voice into the repository.
 */
export function syntheticPcm16(options: {
  durationMs: number;
  sampleRateHz?: number;
  frequencyHz?: number;
  /** 0 = silence, 1 = full scale. */
  amplitude?: number;
}): Int16Array {
  const sampleRate = options.sampleRateHz ?? 24_000;
  const frequency = options.frequencyHz ?? 220;
  const amplitude = Math.min(1, Math.max(0, options.amplitude ?? 0.3));
  const sampleCount = Math.round((options.durationMs / 1000) * sampleRate);
  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    samples[i] = Math.round(Math.sin(2 * Math.PI * frequency * t) * amplitude * 32_767);
  }
  return samples;
}

/** Silence, for testing VAD end-of-speech detection. */
export function syntheticSilence(durationMs: number, sampleRateHz = 24_000): Int16Array {
  return new Int16Array(Math.round((durationMs / 1000) * sampleRateHz));
}

/** Adds white noise to a signal, to exercise noisy-environment behaviour. */
export function withNoise(signal: Int16Array, noiseLevel = 0.05, seed = 42): Int16Array {
  let state = seed;
  const random = () => {
    // xorshift32 — deterministic, so noisy fixtures are reproducible.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff - 0.5;
  };
  const out = new Int16Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    const noisy = (signal[i] ?? 0) + random() * noiseLevel * 32_767;
    out[i] = Math.max(-32_768, Math.min(32_767, Math.round(noisy)));
  }
  return out;
}

export const TEST_ACCESS_CODE = '728416';
export const TEST_ANONYMOUS_ID = 'anon_0123456789abcdef0123456789abcdef';
