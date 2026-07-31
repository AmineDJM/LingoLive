import type {
  ErrorHandler,
  FinalHandler,
  PartialHandler,
  RealtimeState,
  RealtimeTranscriptionTransport,
  RealtimeTransportError,
  StateHandler,
  TranscriptionConfig,
  Unsubscribe,
} from '@lingolive/contracts';

/**
 * Deterministic offline transport.
 *
 * This is what makes `AI_PROVIDER=mock` a first-class mode rather than a stub:
 * the whole product — Listen, Discuss, Join, save, export, reconnect — runs
 * end-to-end with no OpenAI account, which is what the test suite, the CI
 * pipeline and the store screenshot scripts all use.
 *
 * It emits realistic deltas (word by word) followed by a punctuated final, so
 * the partial→final replacement logic is genuinely exercised.
 */

export interface MockScript {
  readonly language: string;
  readonly sentences: readonly string[];
}

/** Free-to-use, purpose-written fixture speech. No third-party content. */
export const MOCK_SCRIPTS: Record<string, MockScript> = {
  fr: {
    language: 'fr',
    sentences: [
      'Nous allons maintenant présenter les résultats du troisième trimestre.',
      'Le chiffre d’affaires a progressé de douze pour cent sur un an.',
      'La prochaine réunion aura lieu le quinze mars à quatorze heures.',
      'Est-ce que quelqu’un a une question sur ce point ?',
    ],
  },
  en: {
    language: 'en',
    sentences: [
      'Welcome everyone, thank you for joining this session today.',
      'Revenue grew by twelve percent compared with last year.',
      'The next meeting is scheduled for March fifteenth at two p.m.',
      'Does anyone have a question about this section?',
    ],
  },
  ar: {
    language: 'ar',
    sentences: [
      'أهلاً بالجميع، شكراً لانضمامكم إلى هذه الجلسة اليوم.',
      'ارتفعت الإيرادات بنسبة اثني عشر بالمئة مقارنة بالعام الماضي.',
      'الاجتماع القادم يوم الخامس عشر من مارس في الساعة الثانية ظهراً.',
      'هل لدى أحدكم سؤال حول هذه النقطة؟',
    ],
  },
  'pt-BR': {
    language: 'pt-BR',
    sentences: [
      'Bom dia a todos, obrigado por participarem desta sessão.',
      'A receita cresceu doze por cento em relação ao ano passado.',
      'A próxima reunião será no dia quinze de março, às duas da tarde.',
      'Alguém tem alguma pergunta sobre este ponto?',
    ],
  },
  es: {
    language: 'es',
    sentences: [
      'Buenos días a todos, gracias por acompañarnos en esta sesión.',
      'Los ingresos crecieron un doce por ciento respecto al año pasado.',
      'La próxima reunión será el quince de marzo a las dos de la tarde.',
      '¿Alguien tiene alguna pregunta sobre este punto?',
    ],
  },
  de: {
    language: 'de',
    sentences: [
      'Guten Tag zusammen, danke für Ihre Teilnahme an dieser Sitzung.',
      'Der Umsatz ist im Vergleich zum Vorjahr um zwölf Prozent gestiegen.',
      'Das nächste Treffen findet am fünfzehnten März um vierzehn Uhr statt.',
      'Hat jemand eine Frage zu diesem Punkt?',
    ],
  },
  it: {
    language: 'it',
    sentences: [
      'Buongiorno a tutti, grazie per aver partecipato a questa sessione.',
      'Il fatturato è cresciuto del dodici per cento rispetto allo scorso anno.',
      'Il prossimo incontro è previsto per il quindici marzo alle quattordici.',
      'Qualcuno ha una domanda su questo punto?',
    ],
  },
};

export interface MockTransportOptions {
  /** Which fixture script to speak. Falls back to English. */
  language?: string;
  /** Milliseconds between word-level deltas. */
  deltaIntervalMs?: number;
  /** Pause between the final of one sentence and the first delta of the next. */
  sentenceGapMs?: number;
  /** Injectables for deterministic tests. */
  setTimeoutFn?: (handler: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  /** Simulate a mid-session disconnection after N finals, for resilience tests. */
  failAfterFinals?: number;
  /** Loop the script instead of stopping at the end. */
  loop?: boolean;
}

export class MockTranscriptionTransport implements RealtimeTranscriptionTransport {
  private partialHandlers = new Set<PartialHandler>();
  private finalHandlers = new Set<FinalHandler>();
  private stateHandlers = new Set<StateHandler>();
  private errorHandlers = new Set<ErrorHandler>();

  private state: RealtimeState = 'idle';
  private timer: unknown = null;
  private sentenceIndex = 0;
  private wordIndex = 0;
  private finalsEmitted = 0;
  private running = false;
  private startedAt = 0;
  private config: TranscriptionConfig | null = null;

  private readonly setTimeoutFn: (handler: () => void, ms: number) => unknown;
  private readonly clearTimeoutFn: (handle: unknown) => void;

  constructor(private readonly options: MockTransportOptions = {}) {
    this.setTimeoutFn =
      options.setTimeoutFn ?? ((handler, ms) => setTimeout(handler, ms) as unknown);
    this.clearTimeoutFn =
      options.clearTimeoutFn ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  private get script(): MockScript {
    const requested = this.options.language ?? this.config?.spokenLanguage ?? 'en';
    return MOCK_SCRIPTS[requested] ?? MOCK_SCRIPTS.en!;
  }

  async connect(config: TranscriptionConfig): Promise<void> {
    this.config = config;
    this.setState('connecting');
    this.setState('ready');
  }

  async startAudio(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.startedAt = Date.now();
    this.setState('listening');
    this.scheduleNextDelta();
  }

  async stopAudio(): Promise<void> {
    this.running = false;
    this.clearTimer();
    this.flushPendingFinal();
    this.setState('ready');
  }

  async pause(): Promise<void> {
    this.running = false;
    this.clearTimer();
    this.setState('paused');
  }

  async resume(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.setState('listening');
    this.scheduleNextDelta();
  }

  async disconnect(): Promise<void> {
    this.running = false;
    this.clearTimer();
    this.setState('ended');
    this.partialHandlers.clear();
    this.finalHandlers.clear();
    this.errorHandlers.clear();
    this.stateHandlers.clear();
  }

  onPartial(handler: PartialHandler): Unsubscribe {
    this.partialHandlers.add(handler);
    return () => this.partialHandlers.delete(handler);
  }

  onFinal(handler: FinalHandler): Unsubscribe {
    this.finalHandlers.add(handler);
    return () => this.finalHandlers.delete(handler);
  }

  onStateChange(handler: StateHandler): Unsubscribe {
    this.stateHandlers.add(handler);
    handler(this.state);
    return () => this.stateHandlers.delete(handler);
  }

  onError(handler: ErrorHandler): Unsubscribe {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /** Test hook: force a transport-level failure. */
  simulateFailure(error: RealtimeTransportError): void {
    this.running = false;
    this.clearTimer();
    this.setState('reconnecting');
    for (const handler of this.errorHandlers) handler(error);
  }

  private scheduleNextDelta(): void {
    if (!this.running) return;
    const interval = this.options.deltaIntervalMs ?? 120;
    this.timer = this.setTimeoutFn(() => this.tick(), interval);
  }

  private tick(): void {
    if (!this.running) return;
    const sentences = this.script.sentences;
    const sentence = sentences[this.sentenceIndex % sentences.length];
    if (!sentence) {
      this.running = false;
      return;
    }

    const words = sentence.split(' ');
    this.wordIndex += 1;

    if (this.wordIndex < words.length) {
      this.emitPartial(words.slice(0, this.wordIndex).join(' '));
      this.scheduleNextDelta();
      return;
    }

    this.emitFinal(sentence);
    this.wordIndex = 0;
    this.sentenceIndex += 1;
    this.finalsEmitted += 1;

    if (
      this.options.failAfterFinals !== undefined &&
      this.finalsEmitted >= this.options.failAfterFinals
    ) {
      this.simulateFailure({
        code: 'MOCK_CONNECTION_LOST',
        message: 'Simulated network interruption',
        retryable: true,
      });
      return;
    }

    if (!this.options.loop && this.sentenceIndex >= sentences.length) {
      this.running = false;
      this.setState('ready');
      return;
    }

    this.timer = this.setTimeoutFn(() => this.scheduleNextDelta(), this.options.sentenceGapMs ?? 400);
  }

  /** A stop mid-sentence still yields the words already spoken. */
  private flushPendingFinal(): void {
    if (this.wordIndex === 0) return;
    const sentences = this.script.sentences;
    const sentence = sentences[this.sentenceIndex % sentences.length];
    if (!sentence) return;
    const partial = sentence.split(' ').slice(0, this.wordIndex).join(' ');
    if (partial.trim().length > 0) {
      this.emitFinal(`${partial}…`);
      this.finalsEmitted += 1;
    }
    this.wordIndex = 0;
    this.sentenceIndex += 1;
  }

  private emitPartial(text: string): void {
    for (const handler of this.partialHandlers) {
      handler({ text, sourceLanguage: this.script.language });
    }
  }

  private emitFinal(text: string): void {
    const now = Date.now();
    for (const handler of this.finalHandlers) {
      handler({
        text,
        sourceLanguage: this.script.language,
        startedAtMs: Math.max(0, this.startedAt === 0 ? 0 : now - this.startedAt - 1500),
        endedAtMs: Math.max(0, this.startedAt === 0 ? 0 : now - this.startedAt),
        clientSegmentId: `mock-${this.script.language}-${this.finalsEmitted}`,
      });
    }
  }

  private clearTimer(): void {
    if (this.timer) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }
  }

  private setState(state: RealtimeState): void {
    this.state = state;
    for (const handler of this.stateHandlers) handler(state);
  }
}

/**
 * Deterministic pseudo-translation used by the mock provider.
 *
 * It is intentionally *not* a real translation: it is a stable, visibly
 * different rendering of the source, so tests and screenshots can assert
 * "this tile shows the Portuguese version" without pretending the mock
 * understands language.
 */
export function mockTranslate(text: string, targetLanguage: string): string {
  const known = MOCK_TRANSLATIONS[targetLanguage.toLowerCase()];
  if (known) {
    const direct = known[text.trim()];
    if (direct) return direct;
  }
  const tag = targetLanguage.toUpperCase();
  return `[${tag}] ${text}`;
}

/**
 * Hand-written equivalents for the fixture sentences, so mock screenshots and
 * E2E assertions show believable multilingual output rather than tagged text.
 */
const MOCK_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    'Nous allons maintenant présenter les résultats du troisième trimestre.':
      'We will now present the third-quarter results.',
    'Le chiffre d’affaires a progressé de douze pour cent sur un an.':
      'Revenue grew by twelve percent year on year.',
    'La prochaine réunion aura lieu le quinze mars à quatorze heures.':
      'The next meeting will take place on March fifteenth at two p.m.',
    'Est-ce que quelqu’un a une question sur ce point ?':
      'Does anyone have a question about this point?',
  },
  fr: {
    'Welcome everyone, thank you for joining this session today.':
      'Bienvenue à tous, merci de participer à cette session.',
    'Revenue grew by twelve percent compared with last year.':
      'Le chiffre d’affaires a progressé de douze pour cent par rapport à l’an dernier.',
    'The next meeting is scheduled for March fifteenth at two p.m.':
      'La prochaine réunion est prévue le quinze mars à quatorze heures.',
    'Does anyone have a question about this section?':
      'Quelqu’un a-t-il une question sur cette partie ?',
  },
  'pt-br': {
    'Welcome everyone, thank you for joining this session today.':
      'Bem-vindos a todos, obrigado por participarem desta sessão.',
    'Nous allons maintenant présenter les résultats du troisième trimestre.':
      'Vamos agora apresentar os resultados do terceiro trimestre.',
  },
  ar: {
    'Welcome everyone, thank you for joining this session today.':
      'أهلاً بالجميع، شكراً لانضمامكم إلى هذه الجلسة اليوم.',
    'Nous allons maintenant présenter les résultats du troisième trimestre.':
      'سنعرض الآن نتائج الربع الثالث.',
  },
  es: {
    'Welcome everyone, thank you for joining this session today.':
      'Bienvenidos todos, gracias por acompañarnos en esta sesión.',
  },
  de: {
    'Welcome everyone, thank you for joining this session today.':
      'Willkommen zusammen, danke für Ihre Teilnahme an dieser Sitzung.',
  },
  it: {
    'Welcome everyone, thank you for joining this session today.':
      'Benvenuti a tutti, grazie per aver partecipato a questa sessione.',
  },
};
