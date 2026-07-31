import { describe, expect, it, vi } from 'vitest';
import type { TranscriptSegment, Translation } from '@lingolive/contracts';
import {
  backoffDelayMs,
  BoundedAudioBuffer,
  initialContext,
  isValidTransition,
  realtimeReducer,
  shouldGiveUp,
} from './state-machine.js';
import { TranscriptStore } from './transcript-store.js';
import { SessionClient, SOCKET_OPEN, type SocketLike } from './session-client.js';
import {
  activeLanguages,
  canSpeak,
  createDiscussionState,
  layoutPlacements,
  rotateTile,
  setTileLanguage,
  startSpeaking,
  stopSpeaking,
  targetLanguagesForTurn,
  tileTransform,
} from './discussion.js';
import { buildJoinDeepLink, buildJoinUrl, parseJoinLink } from './deep-links.js';
import { MockTranscriptionTransport, mockTranslate } from './mock-transport.js';

// ---------------------------------------------------------------------------

describe('realtime state machine', () => {
  it('walks the happy path from idle to listening', () => {
    let ctx = initialContext;
    ctx = realtimeReducer(ctx, { type: 'PERMISSION_REQUESTED' });
    expect(ctx.state).toBe('requesting_permission');
    ctx = realtimeReducer(ctx, { type: 'PERMISSION_GRANTED' });
    expect(ctx.state).toBe('requesting_token');
    ctx = realtimeReducer(ctx, { type: 'TOKEN_RECEIVED' });
    expect(ctx.state).toBe('connecting');
    ctx = realtimeReducer(ctx, { type: 'CONNECTED' });
    expect(ctx.state).toBe('ready');
    expect(ctx.capturing).toBe(false);
    ctx = realtimeReducer(ctx, { type: 'AUDIO_STARTED' });
    expect(ctx.state).toBe('listening');
    expect(ctx.capturing).toBe(true);
    expect(ctx.micIndicatorVisible).toBe(true);
  });

  it('really stops capture when paused, and shows it', () => {
    let ctx = realtimeReducer(initialContext, { type: 'TOKEN_REQUESTED' });
    ctx = realtimeReducer(ctx, { type: 'TOKEN_RECEIVED' });
    ctx = realtimeReducer(ctx, { type: 'CONNECTED' });
    ctx = realtimeReducer(ctx, { type: 'AUDIO_STARTED' });
    ctx = realtimeReducer(ctx, { type: 'PAUSED' });
    expect(ctx.state).toBe('paused');
    expect(ctx.capturing).toBe(false);
    // The session is still open, so the user must still see the mic affordance.
    expect(ctx.micIndicatorVisible).toBe(true);
    ctx = realtimeReducer(ctx, { type: 'RESUMED' });
    expect(ctx.capturing).toBe(true);
  });

  it('stops capturing and hides the indicator once ended', () => {
    let ctx = realtimeReducer(initialContext, { type: 'TOKEN_REQUESTED' });
    ctx = realtimeReducer(ctx, { type: 'TOKEN_RECEIVED' });
    ctx = realtimeReducer(ctx, { type: 'CONNECTED' });
    ctx = realtimeReducer(ctx, { type: 'AUDIO_STARTED' });
    ctx = realtimeReducer(ctx, { type: 'END_REQUESTED' });
    expect(ctx.capturing).toBe(false);
    ctx = realtimeReducer(ctx, { type: 'ENDED' });
    expect(ctx.state).toBe('ended');
    expect(ctx.micIndicatorVisible).toBe(false);
  });

  it('never resurrects an ended session on a late CONNECTION_LOST', () => {
    let ctx = realtimeReducer(initialContext, { type: 'TOKEN_REQUESTED' });
    ctx = realtimeReducer(ctx, { type: 'TOKEN_RECEIVED' });
    ctx = realtimeReducer(ctx, { type: 'CONNECTED' });
    ctx = realtimeReducer(ctx, { type: 'END_REQUESTED' });
    ctx = realtimeReducer(ctx, { type: 'ENDED' });
    const after = realtimeReducer(ctx, { type: 'CONNECTION_LOST' });
    expect(after.state).toBe('ended');
  });

  it('counts reconnection attempts and resets them on success', () => {
    let ctx = realtimeReducer(initialContext, { type: 'TOKEN_REQUESTED' });
    ctx = realtimeReducer(ctx, { type: 'TOKEN_RECEIVED' });
    ctx = realtimeReducer(ctx, { type: 'CONNECTED' });
    ctx = realtimeReducer(ctx, { type: 'AUDIO_STARTED' });
    ctx = realtimeReducer(ctx, { type: 'CONNECTION_LOST' });
    expect(ctx.state).toBe('reconnecting');
    expect(ctx.attempt).toBe(1);
    expect(ctx.capturing).toBe(false);
    ctx = realtimeReducer(ctx, { type: 'RECONNECTED' });
    expect(ctx.state).toBe('listening');
    expect(ctx.attempt).toBe(0);
  });

  it('records a permission denial as a retryable error', () => {
    const ctx = realtimeReducer(initialContext, { type: 'PERMISSION_DENIED' });
    expect(ctx.state).toBe('error');
    expect(ctx.error?.code).toBe('MIC_PERMISSION_DENIED');
    expect(ctx.error?.retryable).toBe(true);
    expect(ctx.capturing).toBe(false);
  });

  it('rejects impossible transitions', () => {
    expect(isValidTransition('idle', 'listening')).toBe(false);
    expect(isValidTransition('ended', 'listening')).toBe(false);
    expect(isValidTransition('ready', 'listening')).toBe(true);
    const ctx = realtimeReducer(initialContext, { type: 'AUDIO_STARTED' });
    expect(ctx.state).toBe('idle');
  });
});

describe('reconnection backoff', () => {
  it('grows exponentially and is capped', () => {
    const noJitter = { jitter: 0 };
    expect(backoffDelayMs(1, noJitter)).toBe(500);
    expect(backoffDelayMs(2, noJitter)).toBe(1000);
    expect(backoffDelayMs(3, noJitter)).toBe(2000);
    expect(backoffDelayMs(20, noJitter)).toBe(15_000);
  });

  it('applies jitter within bounds', () => {
    const low = backoffDelayMs(3, {}, () => 0);
    const high = backoffDelayMs(3, {}, () => 1);
    expect(low).toBe(1500);
    expect(high).toBe(2500);
  });

  it('gives up after the configured number of attempts', () => {
    expect(shouldGiveUp(7)).toBe(false);
    expect(shouldGiveUp(8)).toBe(true);
    expect(shouldGiveUp(3, { maxAttempts: 3 })).toBe(true);
  });
});

describe('BoundedAudioBuffer — memory only, always bounded', () => {
  it('drops the oldest audio beyond the window', () => {
    const buffer = new BoundedAudioBuffer(1000);
    for (let i = 0; i < 20; i++) buffer.push(new Uint8Array([i]), 200);
    expect(buffer.durationMs).toBeLessThanOrEqual(1000);
    expect(buffer.size).toBeLessThanOrEqual(5);
  });

  it('empties itself when drained', () => {
    const buffer = new BoundedAudioBuffer(1000);
    buffer.push(new Uint8Array([1]), 100);
    expect(buffer.drain()).toHaveLength(1);
    expect(buffer.size).toBe(0);
    expect(buffer.durationMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------

function segment(sequence: number, text: string, extra: Partial<TranscriptSegment> = {}) {
  return {
    id: `seg-${sequence}`,
    sessionId: 'ses-1',
    sequence,
    originalText: text,
    isFinal: true,
    sourceLanguage: 'fr',
    speakerSlotId: null,
    ...extra,
  } satisfies TranscriptSegment;
}

function translation(sequence: number, language: string, text: string): Translation {
  return {
    segmentId: `seg-${sequence}`,
    targetLanguage: language,
    translatedText: text,
    model: 'mock',
    isProvisional: false,
  };
}

describe('TranscriptStore', () => {
  it('orders segments by sequence regardless of arrival order', () => {
    const store = new TranscriptStore();
    store.applyFinal(segment(3, 'trois'));
    store.applyFinal(segment(1, 'un'));
    store.applyFinal(segment(2, 'deux'));
    expect(store.render('original').map((l) => l.text)).toEqual(['un', 'deux', 'trois']);
    expect(store.lastSequence).toBe(3);
  });

  it('is idempotent — a replay after reconnect cannot duplicate a segment', () => {
    const store = new TranscriptStore();
    store.applyFinal(segment(1, 'un'));
    store.applyFinal(segment(1, 'un'));
    store.applyFinal(segment(1, 'un corrigé'));
    const lines = store.render('original');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe('un corrigé');
  });

  it('replaces the partial with the final rather than showing both', () => {
    const store = new TranscriptStore();
    store.applyPartial({ slotId: null, text: 'Nous allons', sourceLanguage: 'fr', sequence: 1 });
    expect(store.render('original')).toHaveLength(1);
    expect(store.render('original')[0]!.isFinal).toBe(false);

    store.applyFinal(segment(1, 'Nous allons commencer.'));
    const lines = store.render('original');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.isFinal).toBe(true);
    expect(lines[0]!.text).toBe('Nous allons commencer.');
  });

  it('ignores a stale partial for an already-finalised sequence', () => {
    const store = new TranscriptStore();
    store.applyFinal(segment(1, 'final'));
    store.applyPartial({ slotId: null, text: 'late', sourceLanguage: 'fr', sequence: 1 });
    expect(store.render('original')).toHaveLength(1);
  });

  it('keeps one partial per discussion slot', () => {
    const store = new TranscriptStore();
    store.applyPartial({ slotId: 'tile-0', text: 'bonjour', sourceLanguage: 'fr', sequence: 1 });
    store.applyPartial({ slotId: 'tile-1', text: 'hello', sourceLanguage: 'en', sequence: 2 });
    store.applyPartial({
      slotId: 'tile-0',
      text: 'bonjour à tous',
      sourceLanguage: 'fr',
      sequence: 1,
    });
    const partials = store.render('original').filter((l) => !l.isFinal);
    expect(partials).toHaveLength(2);
    expect(partials.find((p) => p.slotId === 'tile-0')!.text).toBe('bonjour à tous');
  });

  it('shows the translation for the reader language and the original otherwise', () => {
    const store = new TranscriptStore();
    store.applyFinal(segment(1, 'Bonjour à tous.'), [translation(1, 'en', 'Hello everyone.')]);
    expect(store.render('en')[0]!.text).toBe('Hello everyone.');
    expect(store.render('en')[0]!.isOriginal).toBe(false);
    expect(store.render('original')[0]!.text).toBe('Bonjour à tous.');
    // Reader speaks the source language: no translation needed.
    expect(store.render('fr')[0]!.text).toBe('Bonjour à tous.');
    expect(store.render('fr')[0]!.isTranslationPending).toBe(false);
  });

  it('falls back to the original while a translation is still in flight', () => {
    const store = new TranscriptStore();
    store.applyFinal(segment(1, 'Bonjour à tous.'));
    const line = store.render('de')[0]!;
    expect(line.text).toBe('Bonjour à tous.');
    expect(line.isTranslationPending).toBe(true);

    store.applyTranslation(translation(1, 'de', 'Hallo zusammen.'));
    expect(store.render('de')[0]!.text).toBe('Hallo zusammen.');
    expect(store.render('de')[0]!.isTranslationPending).toBe(false);
  });

  it('reports the sequences missing after a lossy reconnection', () => {
    const store = new TranscriptStore();
    store.applyFinal(segment(1, 'a'));
    store.applyFinal(segment(4, 'd'));
    expect(store.missingSequences()).toEqual([2, 3]);
  });

  it('rehydrates from a server snapshot', () => {
    const store = new TranscriptStore();
    store.applyFinal(segment(9, 'stale'));
    store.hydrate([
      { segment: segment(1, 'un'), translations: [translation(1, 'en', 'one')] },
      { segment: segment(2, 'deux'), translations: [] },
    ]);
    expect(store.finalCount).toBe(2);
    expect(store.lastSequence).toBe(2);
    expect(store.render('en').map((l) => l.text)).toEqual(['one', 'deux']);
  });

  it('deduplicates client segment ids so a mid-flush reconnect cannot double-post', () => {
    const store = new TranscriptStore();
    expect(store.registerClientSegmentId('abc')).toBe(true);
    expect(store.registerClientSegmentId('abc')).toBe(false);
  });

  it('exports plain text in the reader language, finals only', () => {
    const store = new TranscriptStore();
    store.applyFinal(segment(1, 'Bonjour.'), [translation(1, 'en', 'Hello.')]);
    store.applyFinal(segment(2, 'Ça va ?'), [translation(2, 'en', 'How are you?')]);
    store.applyPartial({ slotId: null, text: 'en cours', sourceLanguage: 'fr', sequence: 3 });
    expect(store.toPlainText('en')).toBe('Hello.\n\nHow are you?');
  });
});

// ---------------------------------------------------------------------------

class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({});
  }

  open(): void {
    this.readyState = SOCKET_OPEN;
    this.onopen?.({});
  }

  receive(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

describe('SessionClient', () => {
  function build(overrides: { failFirst?: boolean } = {}) {
    const sockets: FakeSocket[] = [];
    const timers: Array<{ handler: () => void; ms: number }> = [];
    const events: unknown[] = [];
    const statuses: string[] = [];

    const client = new SessionClient({
      url: 'wss://api.test/realtime',
      token: 'signed-participant-token',
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      onEvent: (event) => events.push(event),
      onStatusChange: (status) => statuses.push(status),
      setTimeoutFn: (handler, ms) => {
        timers.push({ handler, ms });
        return timers.length - 1;
      },
      clearTimeoutFn: () => undefined,
      random: () => 0.5,
      backoff: { maxAttempts: 3 },
    });

    void overrides;
    return { client, sockets, timers, events, statuses };
  }

  it('joins with the last rendered sequence so the server replays exactly the gap', () => {
    const { client, sockets } = build();
    client.connect();
    sockets[0]!.open();

    const join = JSON.parse(sockets[0]!.sent[0]!);
    expect(join.type).toBe('session.join');
    expect(join.token).toBe('signed-participant-token');
    expect(join.lastSequence).toBe(0);

    sockets[0]!.receive({
      type: 'transcript.final',
      segment: segment(7, 'sept'),
    });
    expect(client.getLastSequence()).toBe(7);

    sockets[0]!.close();
    expect(client.getStatus()).toBe('reconnecting');
  });

  it('reconnects with backoff and resumes from the right sequence', () => {
    const { client, sockets, timers } = build();
    client.connect();
    sockets[0]!.open();
    sockets[0]!.receive({ type: 'transcript.final', segment: segment(3, 'trois') });
    sockets[0]!.close();

    const reconnectTimer = timers[timers.length - 1]!;
    expect(reconnectTimer.ms).toBeGreaterThan(0);
    reconnectTimer.handler();

    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    const rejoin = JSON.parse(sockets[1]!.sent[0]!);
    expect(rejoin.lastSequence).toBe(3);
    expect(client.getStatus()).toBe('connected');
  });

  it('never opens two sockets at once', () => {
    const { client, sockets } = build();
    client.connect();
    client.connect();
    client.connect();
    expect(sockets).toHaveLength(1);
  });

  it('gives up after the configured attempts instead of retrying forever', () => {
    const { client, sockets, timers } = build();
    client.connect();
    // Every attempt fails before the socket ever opens.
    for (let i = 0; i < 5 && client.getStatus() !== 'failed'; i++) {
      sockets[sockets.length - 1]!.close();
      if (client.getStatus() === 'failed') break;
      timers[timers.length - 1]!.handler();
    }
    expect(client.getStatus()).toBe('failed');
    expect(sockets.length).toBeLessThanOrEqual(3);
  });

  it('stops completely once the session ends — no ghost stream', () => {
    const { client, sockets } = build();
    client.connect();
    sockets[0]!.open();
    sockets[0]!.receive({
      type: 'session.ended',
      sessionId: 'ses-1',
      durationSeconds: 42,
      reason: 'USER_ENDED',
    });
    expect(client.getStatus()).toBe('closed');
    sockets[0]!.close();
    expect(sockets).toHaveLength(1);
  });

  it('drops malformed frames rather than crashing the session', () => {
    const { client, sockets, events } = build();
    client.connect();
    sockets[0]!.open();
    sockets[0]!.onmessage?.({ data: 'not json' });
    sockets[0]!.receive({ type: 'unknown.event' });
    expect(events).toHaveLength(0);
  });

  it('refuses to send an invalid client event', () => {
    const { client, sockets } = build();
    client.connect();
    sockets[0]!.open();
    const before = sockets[0]!.sent.length;
    // @ts-expect-error deliberately invalid payload
    expect(client.send({ type: 'speaker.start', slotId: 42 })).toBe(false);
    expect(sockets[0]!.sent.length).toBe(before);
  });

  it('leaves cleanly on close()', () => {
    const { client, sockets } = build();
    client.connect();
    sockets[0]!.open();
    client.close();
    const last = JSON.parse(sockets[0]!.sent[sockets[0]!.sent.length - 1]!);
    expect(last.type).toBe('session.leave');
    expect(client.getStatus()).toBe('closed');
  });
});

// ---------------------------------------------------------------------------

describe('discussion canvas', () => {
  it('lays out 2, 3 and 4 people with correct physical rotations', () => {
    const two = createDiscussionState(2, ['fr', 'pt-BR']);
    expect(two.tiles.map((t) => t.rotation)).toEqual([0, 180]);

    const three = createDiscussionState(3, ['fr', 'en', 'ar']);
    expect(three.tiles.map((t) => t.rotation)).toEqual([0, 90, 270]);

    const four = createDiscussionState(4, ['fr', 'en', 'ar', 'de']);
    expect(four.tiles.map((t) => t.rotation)).toEqual([0, 90, 180, 270]);
    expect(four.tiles).toHaveLength(4);
  });

  it('gives every layout a unique grid placement', () => {
    for (const count of [2, 3, 4] as const) {
      const state = createDiscussionState(count, ['fr', 'en', 'ar', 'de']);
      const placements = layoutPlacements(state);
      expect(placements).toHaveLength(count);
      const cells = placements.map((p) => `${p.column}:${p.row}`);
      expect(new Set(cells).size).toBe(count);
    }
  });

  it('rotates one tile at a time, cycling 0→90→180→270→0', () => {
    let state = createDiscussionState(2, ['fr', 'en']);
    const otherBefore = state.tiles[1]!.rotation;
    state = rotateTile(state, 'tile-0');
    expect(state.tiles[0]!.rotation).toBe(90);
    expect(state.tiles[1]!.rotation).toBe(otherBefore);
    state = rotateTile(state, 'tile-0');
    state = rotateTile(state, 'tile-0');
    expect(state.tiles[0]!.rotation).toBe(270);
    state = rotateTile(state, 'tile-0');
    expect(state.tiles[0]!.rotation).toBe(0);
  });

  it('keeps Arabic right-to-left inside a rotated tile', () => {
    let state = createDiscussionState(3, ['fr', 'en', 'ar']);
    const arabicTile = state.tiles[2]!;
    expect(arabicTile.direction).toBe('rtl');
    expect(tileTransform(arabicTile)).toEqual({
      rotateDeg: 270,
      direction: 'rtl',
      isQuarterTurn: true,
    });

    state = rotateTile(state, arabicTile.id);
    const rotated = state.tiles[2]!;
    expect(rotated.rotation).toBe(0);
    // Rotation must never flip text direction.
    expect(rotated.direction).toBe('rtl');
  });

  it('updates direction when a tile switches to or from an RTL language', () => {
    let state = createDiscussionState(2, ['fr', 'en']);
    expect(state.tiles[1]!.direction).toBe('ltr');
    state = setTileLanguage(state, 'tile-1', 'ar');
    expect(state.tiles[1]!.direction).toBe('rtl');
    expect(state.tiles[1]!.readingLanguage).toBe('ar');
    state = setTileLanguage(state, 'tile-1', 'he');
    expect(state.tiles[1]!.direction).toBe('rtl');
    state = setTileLanguage(state, 'tile-1', 'de');
    expect(state.tiles[1]!.direction).toBe('ltr');
  });

  it('allows exactly one speaker at a time', () => {
    let state = createDiscussionState(4, ['fr', 'en', 'ar', 'de']);
    expect(canSpeak(state, 'tile-0')).toBe(true);
    state = startSpeaking(state, 'tile-0');
    expect(state.activeSpeakerTileId).toBe('tile-0');
    expect(canSpeak(state, 'tile-1')).toBe(false);

    const blocked = startSpeaking(state, 'tile-1');
    expect(blocked.activeSpeakerTileId).toBe('tile-0');

    state = stopSpeaking(state, 'tile-0');
    expect(state.activeSpeakerTileId).toBeNull();
    expect(canSpeak(state, 'tile-1')).toBe(true);
  });

  it('ignores a stop from a tile that is not speaking', () => {
    let state = startSpeaking(createDiscussionState(2, ['fr', 'en']), 'tile-0');
    state = stopSpeaking(state, 'tile-1');
    expect(state.activeSpeakerTileId).toBe('tile-0');
  });

  it('translates once per distinct target language — never once per person', () => {
    // Four people, but only two other reading languages.
    const state = createDiscussionState(4, ['fr', 'en', 'en', 'ar']);
    const targets = targetLanguagesForTurn(state, 'tile-0', 'fr');
    expect(targets.sort()).toEqual(['ar', 'en']);
    expect(targets).toHaveLength(2);
  });

  it('does not translate back into the language actually spoken', () => {
    const state = createDiscussionState(3, ['fr', 'en', 'fr']);
    expect(targetLanguagesForTurn(state, 'tile-1', 'en')).toEqual(['fr']);
  });

  it('needs no translation when everybody reads the speaker language', () => {
    const state = createDiscussionState(3, ['fr', 'fr', 'fr']);
    expect(targetLanguagesForTurn(state, 'tile-0', 'fr')).toEqual([]);
  });

  it('reports the distinct languages on the table', () => {
    const state = createDiscussionState(4, ['fr', 'en', 'fr', 'ar']);
    expect(activeLanguages(state).sort()).toEqual(['ar', 'en', 'fr']);
  });
});

// ---------------------------------------------------------------------------

describe('deep links', () => {
  it('parses the custom scheme', () => {
    expect(parseJoinLink('lingolive://join/728416')).toEqual({
      code: '728416',
      joinToken: null,
      language: null,
    });
  });

  it('parses the https universal link', () => {
    expect(parseJoinLink('https://lingolive.app/join/728416')).toEqual({
      code: '728416',
      joinToken: null,
      language: null,
    });
  });

  it('parses a signed token link that does not expose the code', () => {
    const parsed = parseJoinLink('https://lingolive.app/join?t=abc.def.ghi&lang=ar');
    expect(parsed).toEqual({ code: null, joinToken: 'abc.def.ghi', language: 'ar' });
  });

  it('parses a manually typed code, with or without separators', () => {
    expect(parseJoinLink('728416')?.code).toBe('728416');
    expect(parseJoinLink('728 416')?.code).toBe('728416');
    expect(parseJoinLink('728-416')?.code).toBe('728416');
  });

  it('rejects anything that is not a join target', () => {
    expect(parseJoinLink('')).toBeNull();
    expect(parseJoinLink('hello world')).toBeNull();
    expect(parseJoinLink('https://example.com/other')).toBeNull();
    expect(parseJoinLink('https://lingolive.app/join/12')).toBeNull();
    expect(parseJoinLink('javascript:alert(1)')).toBeNull();
  });

  it('builds links that round-trip', () => {
    const url = buildJoinUrl({ code: '728416' });
    expect(url).toBe('https://lingolive.app/join/728416');
    expect(parseJoinLink(url)?.code).toBe('728416');

    const deep = buildJoinDeepLink({ code: '728416', language: 'fr' });
    expect(deep).toBe('lingolive://join/728416?lang=fr');
    expect(parseJoinLink(deep)).toEqual({ code: '728416', joinToken: null, language: 'fr' });
  });
});

// ---------------------------------------------------------------------------

describe('mock transport', () => {
  it('emits word-level deltas then a punctuated final', async () => {
    vi.useFakeTimers();
    const transport = new MockTranscriptionTransport({ language: 'fr', deltaIntervalMs: 10 });
    const partials: string[] = [];
    const finals: string[] = [];
    transport.onPartial((p) => partials.push(p.text));
    transport.onFinal((f) => finals.push(f.text));

    await transport.connect({
      sessionId: 'ses-1',
      clientSecret: 'ephemeral',
      expiresAt: new Date().toISOString(),
      model: 'mock',
      endpoint: 'mock://',
      transport: 'mock',
      audio: { sampleRateHz: 24_000, encoding: 'pcm16', channels: 1, chunkMs: 20 },
      vad: { mode: 'server', silenceMs: 500, threshold: 0.5, prefixPaddingMs: 300 },
      spokenLanguage: 'fr',
      vocabularyHints: [],
      noiseReduction: 'near_field',
    });
    await transport.startAudio();

    await vi.advanceTimersByTimeAsync(500);

    expect(partials.length).toBeGreaterThan(2);
    expect(finals.length).toBeGreaterThanOrEqual(1);
    expect(finals[0]).toMatch(/[.!?]$/);
    // Each delta strictly extends the previous one.
    expect(partials[1]!.startsWith(partials[0]!)).toBe(true);

    await transport.disconnect();
    vi.useRealTimers();
  });

  it('can simulate a mid-session disconnection', async () => {
    vi.useFakeTimers();
    const transport = new MockTranscriptionTransport({
      language: 'en',
      deltaIntervalMs: 5,
      failAfterFinals: 1,
    });
    const errors: string[] = [];
    transport.onError((e) => errors.push(e.code));
    await transport.connect({
      sessionId: 'ses-1',
      clientSecret: 'x',
      expiresAt: new Date().toISOString(),
      model: 'mock',
      endpoint: 'mock://',
      transport: 'mock',
      audio: { sampleRateHz: 24_000, encoding: 'pcm16', channels: 1, chunkMs: 20 },
      vad: { mode: 'server', silenceMs: 500, threshold: 0.5, prefixPaddingMs: 300 },
      spokenLanguage: 'en',
      vocabularyHints: [],
      noiseReduction: 'near_field',
    });
    await transport.startAudio();
    await vi.advanceTimersByTimeAsync(1000);
    expect(errors).toContain('MOCK_CONNECTION_LOST');
    await transport.disconnect();
    vi.useRealTimers();
  });

  it('produces stable, deterministic pseudo-translations', () => {
    const source = 'Nous allons maintenant présenter les résultats du troisième trimestre.';
    expect(mockTranslate(source, 'en')).toBe('We will now present the third-quarter results.');
    expect(mockTranslate(source, 'en')).toBe(mockTranslate(source, 'en'));
    expect(mockTranslate('unknown sentence', 'de')).toBe('[DE] unknown sentence');
  });
});
