import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ServerEvent } from '@lingolive/contracts';
import {
  authHeaders,
  createHarness,
  registerGuest,
  resetDatabase,
  type TestHarness,
} from './helpers.js';

/**
 * These tests bind a real port and speak the real WebSocket protocol, because
 * the properties that matter — snapshot replay from a sequence, one
 * translation fanned out to many viewers, gap-free reconnection — only exist
 * end to end.
 */

let harness: TestHarness;
let baseUrl: string;

beforeAll(async () => {
  harness = await createHarness();
  const address = await harness.app.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = address.replace('http://', 'ws://');
});

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await resetDatabase(harness.prisma);
});

/** A tiny client that records every event it receives. */
class TestClient {
  readonly events: ServerEvent[] = [];
  private socket: WebSocket;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on('message', (raw: Buffer) => {
      this.events.push(JSON.parse(raw.toString()) as ServerEvent);
    });
  }

  async open(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      this.socket.once('open', () => resolve());
      this.socket.once('error', reject);
    });
  }

  send(event: unknown): void {
    this.socket.send(JSON.stringify(event));
  }

  /** Waits for the first event of a type, or throws after the timeout. */
  async waitFor<T extends ServerEvent['type']>(
    type: T,
    timeoutMs = 5000,
  ): Promise<Extract<ServerEvent, { type: T }>> {
    const existing = this.events.find((event) => event.type === type);
    if (existing) return existing as Extract<ServerEvent, { type: T }>;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.off('message', onMessage);
        reject(
          new Error(
            `Timed out waiting for ${type}; saw: ${this.events.map((e) => e.type).join(', ')}`,
          ),
        );
      }, timeoutMs);

      const onMessage = (raw: Buffer): void => {
        const event = JSON.parse(raw.toString()) as ServerEvent;
        if (event.type === type) {
          clearTimeout(timer);
          this.socket.off('message', onMessage);
          resolve(event as Extract<ServerEvent, { type: T }>);
        }
      };
      this.socket.on('message', onMessage);
    });
  }

  async waitForClose(timeoutMs = 5000): Promise<number> {
    if (this.socket.readyState === WebSocket.CLOSED) return this.socket.readyState;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for close')), timeoutMs);
      this.socket.once('close', (code: number) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }

  close(): void {
    this.socket.close();
  }
}

async function createListenSession(): Promise<{
  token: string;
  sessionId: string;
  realtimeToken: string;
}> {
  const guest = await registerGuest(harness.app);
  const created = await harness.app.inject({
    method: 'POST',
    url: '/api/v1/sessions',
    headers: authHeaders(guest.token),
    payload: { kind: 'PERSONAL_LISTEN', readingLanguage: 'en' },
  });
  const sessionId = created.json().session.id;

  const tokenResponse = await harness.app.inject({
    method: 'POST',
    url: '/api/v1/realtime/transcription-token',
    headers: authHeaders(guest.token),
    payload: { sessionId, platform: 'web', preferredTransport: 'auto', spokenLanguage: 'auto' },
  });

  return {
    token: guest.token,
    sessionId,
    realtimeToken: tokenResponse.json().realtimeToken,
  };
}

describe('the transcription credential', () => {
  it('treats a room and a table differently', async () => {
    // Listen is a lecture or a meeting: voices metres away, quiet and
    // reverberant. Discuss is people leaning over one device. Sending
    // near-field settings for both — which is what happened — asks the
    // provider to treat distant speech as background noise.
    const guest = await registerGuest(harness.app);

    async function profileFor(kind: 'PERSONAL_LISTEN' | 'PERSONAL_DISCUSS') {
      const session = await harness.app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        headers: authHeaders(guest.token),
        payload: {
          kind,
          readingLanguage: 'fr',
          ...(kind === 'PERSONAL_DISCUSS'
            ? {
                slots: [
                  { position: 0, readingLanguage: 'fr', rotation: 0 },
                  { position: 1, readingLanguage: 'en', rotation: 180 },
                ],
              }
            : {}),
        },
      });
      const response = await harness.app.inject({
        method: 'POST',
        url: '/api/v1/realtime/transcription-token',
        headers: authHeaders(guest.token),
        payload: {
          sessionId: session.json().session.id,
          platform: 'web',
          preferredTransport: 'auto',
          spokenLanguage: 'auto',
        },
      });
      expect(response.statusCode).toBe(200);
      return response.json().config;
    }

    expect((await profileFor('PERSONAL_LISTEN')).noiseReduction).toBe('far_field');
    expect((await profileFor('PERSONAL_DISCUSS')).noiseReduction).toBe('near_field');
  });

  it('does not name the model in the SDP URL', async () => {
    // The model belongs to the ephemeral session. Repeating it in the URL made
    // the provider answer 400 invalid_model — on that endpoint the query
    // parameter picks a CONVERSATION model, so a valid transcription model is
    // rejected there. The failure only appeared at the audio handshake, in the
    // browser, long after the credential had been minted successfully.
    const guest = await registerGuest(harness.app);
    const session = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: authHeaders(guest.token),
      payload: { kind: 'PERSONAL_LISTEN', readingLanguage: 'fr' },
    });

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/realtime/transcription-token',
      headers: authHeaders(guest.token),
      payload: {
        sessionId: session.json().session.id,
        platform: 'web',
        preferredTransport: 'auto',
        spokenLanguage: 'auto',
      },
    });

    expect(response.statusCode).toBe(200);
    const { sdpUrl } = response.json().config;
    expect(sdpUrl).not.toContain('model=');
    expect(sdpUrl).toContain('/realtime');
  });
});

describe('realtime session', () => {
  it('sends a snapshot on join and streams partial then final text', async () => {
    const { realtimeToken } = await createListenSession();
    const client = new TestClient(`${baseUrl}/realtime`);
    await client.open();

    client.send({ type: 'session.join', token: realtimeToken, lastSequence: 0 });
    const snapshot = await client.waitFor('session.snapshot');
    expect(snapshot.segments).toHaveLength(0);
    expect(snapshot.lastSequence).toBe(0);
    expect(snapshot.protocolVersion).toBe(1);

    client.send({ type: 'transcript.partial', text: 'Nous allons', sourceLanguage: 'fr' });
    const partial = await client.waitFor('transcript.partial');
    expect(partial.text).toBe('Nous allons');

    client.send({
      type: 'transcript.final',
      text: 'Nous allons commencer.',
      sourceLanguage: 'fr',
    });
    const final = await client.waitFor('transcript.final');
    expect(final.segment.originalText).toBe('Nous allons commencer.');
    expect(final.segment.sequence).toBe(1);
    expect(final.segment.isFinal).toBe(true);

    client.close();
  });

  it('translates a final segment into the reader’s language', async () => {
    const { realtimeToken } = await createListenSession();
    const client = new TestClient(`${baseUrl}/realtime`);
    await client.open();
    client.send({ type: 'session.join', token: realtimeToken });
    await client.waitFor('session.snapshot');

    client.send({
      type: 'transcript.final',
      text: 'Nous allons maintenant présenter les résultats du troisième trimestre.',
      sourceLanguage: 'fr',
    });

    const translation = await client.waitFor('translation.final');
    expect(translation.translation.targetLanguage).toBe('en');
    expect(translation.translation.translatedText).toBe(
      'We will now present the third-quarter results.',
    );
    client.close();
  });

  it('replays exactly the missing segments after a reconnection', async () => {
    const { realtimeToken } = await createListenSession();

    const first = new TestClient(`${baseUrl}/realtime`);
    await first.open();
    first.send({ type: 'session.join', token: realtimeToken });
    await first.waitFor('session.snapshot');

    for (let i = 1; i <= 3; i++) {
      first.send({ type: 'transcript.final', text: `Line ${i}.`, sourceLanguage: 'fr' });
      await first.waitFor('transcript.final');
      first.events.length = 0;
    }
    first.close();

    // Reconnect having rendered up to sequence 1.
    const second = new TestClient(`${baseUrl}/realtime`);
    await second.open();
    second.send({ type: 'session.join', token: realtimeToken, lastSequence: 1 });
    const snapshot = await second.waitFor('session.snapshot');

    const sequences = snapshot.segments.map((item) => item.segment.sequence);
    expect(sequences).toEqual([2, 3]);
    expect(snapshot.lastSequence).toBe(3);
    second.close();
  });

  it('rejects a socket with no token', async () => {
    const client = new TestClient(`${baseUrl}/realtime`);
    await client.open();
    client.send({ type: 'transcript.final', text: 'unauthorised' });
    const error = await client.waitFor('error');
    expect(error.code).toBe('UNAUTHORIZED');
    await client.waitForClose();
  });

  it('rejects a forged token and closes the socket', async () => {
    const { realtimeToken } = await createListenSession();
    // Same shape, same length, wrong signature.
    const forged = `${realtimeToken.slice(0, -6)}AAAAAA`;

    const client = new TestClient(`${baseUrl}/realtime`);
    await client.open();
    client.send({ type: 'session.join', token: forged });

    const error = await client.waitFor('error');
    expect(error.code).toBe('UNAUTHORIZED');
    // Not retryable: retrying with the same token can never succeed.
    expect(error.retryable).toBe(false);
    await client.waitForClose();
  });

  it('rejects a token that is not shaped like a token at all', async () => {
    const client = new TestClient(`${baseUrl}/realtime`);
    await client.open();
    client.send({ type: 'session.join', token: 'a.b.c' });
    const error = await client.waitFor('error');
    expect(error.code).toBe('BAD_REQUEST');
    client.close();
  });

  it('ignores a malformed frame instead of dropping the session', async () => {
    const { realtimeToken } = await createListenSession();
    const client = new TestClient(`${baseUrl}/realtime`);
    await client.open();
    client.send({ type: 'session.join', token: realtimeToken });
    await client.waitFor('session.snapshot');

    client.send({ type: 'not.a.real.event', whatever: true });
    const error = await client.waitFor('error');
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.retryable).toBe(true);

    // The session still works.
    client.send({ type: 'transcript.final', text: 'Still here.', sourceLanguage: 'fr' });
    const final = await client.waitFor('transcript.final');
    expect(final.segment.originalText).toBe('Still here.');
    client.close();
  });

  it('closes every socket in a room when the session ends', async () => {
    const { realtimeToken } = await createListenSession();
    const client = new TestClient(`${baseUrl}/realtime`);
    await client.open();
    client.send({ type: 'session.join', token: realtimeToken });
    await client.waitFor('session.snapshot');

    client.send({ type: 'session.end' });
    const ended = await client.waitFor('session.ended');
    expect(ended.reason).toBe('USER_ENDED');
    await client.waitForClose();
  });

  it('answers a heartbeat', async () => {
    const { realtimeToken } = await createListenSession();
    const client = new TestClient(`${baseUrl}/realtime`);
    await client.open();
    client.send({ type: 'session.join', token: realtimeToken });
    await client.waitFor('session.snapshot');

    client.send({ type: 'session.heartbeat' });
    const pong = await client.waitFor('pong');
    expect(pong.serverTimeMs).toBeGreaterThan(0);
    client.close();
  });
});

describe('business broadcast fan-out over the wire', () => {
  it('delivers one translation per language to every viewer reading it', async () => {
    const room = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/dev/business/sessions',
      payload: {
        title: 'Fan-out test',
        organizerName: 'Example Org',
        sourceLanguage: 'fr',
        targetLanguages: ['en', 'ar'],
      },
    });
    const { sessionId, code } = room.json();

    const viewers: TestClient[] = [];
    for (const language of ['en', 'en', 'ar']) {
      const joined = await harness.app.inject({
        method: 'POST',
        url: '/api/v1/business/join',
        payload: { code, targetLanguage: language },
      });
      const client = new TestClient(`${baseUrl}/realtime`);
      await client.open();
      client.send({ type: 'session.join', token: joined.json().realtimeToken });
      await client.waitFor('session.snapshot');
      viewers.push(client);
    }

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/dev/business/speak',
      payload: {
        sessionId,
        language: 'fr',
        text: 'Nous allons maintenant présenter les résultats du troisième trimestre.',
      },
    });

    // Every viewer receives the original…
    for (const viewer of viewers) {
      const final = await viewer.waitFor('transcript.final');
      expect(final.segment.originalText).toContain('troisième trimestre');
    }

    // …and each receives the translation for their own language only.
    const english = await viewers[0]!.waitFor('translation.final');
    expect(english.translation.targetLanguage).toBe('en');
    const arabic = await viewers[2]!.waitFor('translation.final');
    expect(arabic.translation.targetLanguage).toBe('ar');

    // Three viewers, two languages, two translations stored.
    expect(await harness.prisma.translation.count()).toBe(2);

    for (const viewer of viewers) viewer.close();
  });

  it('disconnects viewers when the organizer ends the room', async () => {
    const room = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/dev/business/sessions',
      payload: {
        title: 'Ending test',
        organizerName: 'Example Org',
        sourceLanguage: 'fr',
        targetLanguages: ['en'],
      },
    });
    const { sessionId, code } = room.json();

    const joined = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/business/join',
      payload: { code, targetLanguage: 'en' },
    });
    const viewer = new TestClient(`${baseUrl}/realtime`);
    await viewer.open();
    viewer.send({ type: 'session.join', token: joined.json().realtimeToken });
    await viewer.waitFor('session.snapshot');

    await harness.app.inject({
      method: 'POST',
      url: `/api/v1/dev/business/sessions/${sessionId}/end`,
    });

    const ended = await viewer.waitFor('session.ended');
    expect(ended.reason).toBe('ORGANIZER_ENDED');
    await viewer.waitForClose();
  });
});
