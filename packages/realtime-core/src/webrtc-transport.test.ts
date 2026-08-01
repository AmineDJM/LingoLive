import { describe, expect, it, vi } from 'vitest';
import type { TranscriptionConfig } from '@lingolive/contracts';
import {
  parseProviderEvent,
  WebRtcTranscriptionTransport,
  type AudioStreamLike,
  type DataChannelLike,
  type PeerConnectionLike,
  type WebRtcTransportDependencies,
} from './webrtc-transport.js';

/**
 * The real microphone path.
 *
 * It cannot be exercised against the provider from CI — that needs an account,
 * a browser and someone speaking — so everything that does not require those is
 * pinned here: what is sent, what is done with what comes back, when the
 * microphone is open, and what is left running afterwards.
 *
 * The last one is the reason this file is thorough. A transport that leaks a
 * live `MediaStream` leaves the browser's recording indicator on after a
 * session ends, which is indistinguishable from an application that is still
 * listening to the room.
 */

const config: TranscriptionConfig = {
  sessionId: 'session-1',
  clientSecret: 'ek_ephemeral_secret',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  model: 'gpt-live-transcribe',
  endpoint: 'https://provider.test/v1/realtime',
  sdpUrl: 'https://provider.test/v1/realtime/calls?model=gpt-live-transcribe',
  transport: 'webrtc',
  audio: { sampleRateHz: 24_000, encoding: 'pcm16', channels: 1, chunkMs: 20 },
  vad: { mode: 'server', silenceMs: 600, threshold: 0.5, prefixPaddingMs: 300 },
  spokenLanguage: 'auto',
  vocabularyHints: [],
  noiseReduction: 'near_field',
};

interface Harness {
  deps: WebRtcTransportDependencies;
  track: { enabled: boolean; stopped: boolean };
  channel: DataChannelLike;
  peer: { closed: boolean; attached: boolean; remoteSdp: string | null };
  sdpRequests: Array<{ url: string; offerSdp: string; clientSecret: string }>;
  /** Pushes a provider event down the data channel. */
  emit(event: unknown): void;
  fireConnectionState(state: string): void;
}

function harness(
  sdpResponse: { ok: boolean; status: number; body: string } = {
    ok: true,
    status: 201,
    body: 'v=0\r\na=answer',
  },
): Harness {
  const track = { enabled: true, stopped: false };
  const stream: AudioStreamLike = {
    getAudioTracks: () => [
      {
        get enabled() {
          return track.enabled;
        },
        set enabled(value: boolean) {
          track.enabled = value;
        },
        stop: () => {
          track.stopped = true;
        },
      },
    ],
  };

  const channel: DataChannelLike = { onmessage: null, onopen: null, close: () => {} };
  const peer = { closed: false, attached: false, remoteSdp: null as string | null };
  const sdpRequests: Harness['sdpRequests'] = [];
  let connectionStateHandler: ((state: string) => void) | null = null;

  const peerConnection: PeerConnectionLike = {
    onconnectionstatechange: null,
    attachMicrophone: () => {
      peer.attached = true;
    },
    createDataChannel: () => channel,
    createOffer: async () => ({ type: 'offer', sdp: 'v=0\r\na=offer' }),
    setLocalDescription: async () => {},
    setRemoteDescription: async (description) => {
      peer.remoteSdp = description.sdp;
    },
    close: () => {
      peer.closed = true;
    },
  };
  Object.defineProperty(peerConnection, 'onconnectionstatechange', {
    get: () => connectionStateHandler,
    set: (handler: ((state: string) => void) | null) => {
      connectionStateHandler = handler;
    },
  });

  return {
    track,
    channel,
    peer,
    sdpRequests,
    deps: {
      requestMicrophone: async () => stream,
      createPeerConnection: () => peerConnection,
      exchangeSdp: async (request) => {
        sdpRequests.push(request);
        return sdpResponse;
      },
    },
    emit: (event) => channel.onmessage?.({ data: JSON.stringify(event) }),
    fireConnectionState: (state) => connectionStateHandler?.(state),
  };
}

describe('connecting', () => {
  it('sends the offer to the URL the server built, with the ephemeral credential', async () => {
    const h = harness();
    await new WebRtcTranscriptionTransport(h.deps).connect(config);

    expect(h.sdpRequests).toHaveLength(1);
    expect(h.sdpRequests[0]?.url).toBe(config.sdpUrl);
    expect(h.sdpRequests[0]?.offerSdp).toBe('v=0\r\na=offer');
    expect(h.sdpRequests[0]?.clientSecret).toBe('ek_ephemeral_secret');
  });

  it('applies the answer and attaches the microphone', async () => {
    const h = harness();
    await new WebRtcTranscriptionTransport(h.deps).connect(config);

    expect(h.peer.attached).toBe(true);
    expect(h.peer.remoteSdp).toBe('v=0\r\na=answer');
  });

  it('does NOT open the microphone just because it connected', async () => {
    // Connecting asks for permission, which is unavoidable — the offer needs a
    // track. Capturing before the user has started anything is not.
    const h = harness();
    await new WebRtcTranscriptionTransport(h.deps).connect(config);

    expect(h.track.enabled).toBe(false);
  });

  it('reports a rejected credential distinctly from a server fault', async () => {
    const rejected = harness({ ok: false, status: 401, body: 'unauthorized' });
    const error = await new WebRtcTranscriptionTransport(rejected.deps)
      .connect(config)
      .catch((caught: unknown) => caught);
    expect((error as { code?: string }).code).toBe('REALTIME_CREDENTIAL_REJECTED');

    const faulty = harness({ ok: false, status: 503, body: 'upstream down' });
    const transient = await new WebRtcTranscriptionTransport(faulty.deps)
      .connect(config)
      .catch((caught: unknown) => caught);
    expect((transient as { code?: string }).code).toBe('SDP_EXCHANGE_FAILED');
  });

  it('announces a failed exchange to error handlers, not only to the caller', async () => {
    const h = harness({ ok: false, status: 404, body: 'no such route' });
    const transport = new WebRtcTranscriptionTransport(h.deps);
    const errors: string[] = [];
    transport.onError((error) => errors.push(error.code));

    await transport.connect(config).catch(() => undefined);
    expect(errors).toContain('SDP_EXCHANGE_FAILED');
  });

  it('lets a refused microphone propagate unchanged', async () => {
    // NotAllowedError is the browser's own name for "the user said no", and it
    // is what the UI shows as a reference. Wrapping it would lose that.
    const refused = new Error('Permission denied');
    refused.name = 'NotAllowedError';
    const h = harness();
    const transport = new WebRtcTranscriptionTransport({
      ...h.deps,
      requestMicrophone: () => Promise.reject(refused),
    });

    await expect(transport.connect(config)).rejects.toThrow('Permission denied');
  });
});

describe('transcription events', () => {
  async function connected() {
    const h = harness();
    const transport = new WebRtcTranscriptionTransport(h.deps);
    const partials: string[] = [];
    const finals: Array<{ text: string; clientSegmentId?: string | undefined }> = [];
    transport.onPartial((partial) => partials.push(partial.text));
    transport.onFinal((final) => finals.push(final));
    await transport.connect(config);
    return { h, transport, partials, finals };
  }

  it('accumulates deltas rather than replacing them', async () => {
    const { h, partials } = await connected();
    h.emit({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'a',
      delta: 'Bonjour',
    });
    h.emit({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'a',
      delta: ' tout',
    });
    h.emit({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'a',
      delta: ' le monde',
    });

    expect(partials).toEqual(['Bonjour', 'Bonjour tout', 'Bonjour tout le monde']);
  });

  it('keeps two simultaneous items apart', async () => {
    // Deltas for different utterances interleave. Accumulating them into one
    // buffer would splice two people's sentences together.
    const { h, partials } = await connected();
    h.emit({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'a',
      delta: 'Bonjour',
    });
    h.emit({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'b',
      delta: 'Hello',
    });
    h.emit({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'a',
      delta: ' Amine',
    });

    expect(partials).toEqual(['Bonjour', 'Hello', 'Bonjour Amine']);
  });

  it('emits the final and forgets the accumulated partial', async () => {
    const { h, finals, partials } = await connected();
    h.emit({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'a',
      delta: 'Bonjour',
    });
    h.emit({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'a',
      transcript: 'Bonjour tout le monde.',
    });
    h.emit({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'a',
      delta: 'Ensuite',
    });

    expect(finals[0]?.text).toBe('Bonjour tout le monde.');
    // Not 'BonjourEnsuite' — the buffer was cleared by the final.
    expect(partials.at(-1)).toBe('Ensuite');
  });

  it('carries the provider item id so a reconnect cannot duplicate a segment', async () => {
    const { h, finals } = await connected();
    h.emit({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-42',
      transcript: 'Une phrase.',
    });
    expect(finals[0]?.clientSegmentId).toBe('item-42');
  });

  it('drops an empty final rather than writing a blank line', async () => {
    const { h, finals } = await connected();
    h.emit({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'a',
      transcript: '   ',
    });
    expect(finals).toHaveLength(0);
  });

  it('surfaces a provider error event without ending the session', async () => {
    const h = harness();
    const transport = new WebRtcTranscriptionTransport(h.deps);
    const errors: Array<{ code: string; retryable: boolean }> = [];
    transport.onError((error) => errors.push(error));
    await transport.connect(config);

    h.emit({ type: 'error', error: { code: 'rate_limit_exceeded', message: 'Slow down' } });
    expect(errors[0]?.code).toBe('rate_limit_exceeded');
    expect(errors[0]?.retryable).toBe(true);
  });

  it('reports a dropped peer connection as retryable', async () => {
    const h = harness();
    const transport = new WebRtcTranscriptionTransport(h.deps);
    const errors: string[] = [];
    transport.onError((error) => errors.push(error.code));
    await transport.connect(config);

    h.fireConnectionState('failed');
    expect(errors).toContain('REALTIME_CONNECTION_LOST');
  });

  it('labels a segment only with a language the user actually pinned', async () => {
    const h = harness();
    const transport = new WebRtcTranscriptionTransport(h.deps);
    const finals: Array<{ sourceLanguage?: string | undefined }> = [];
    transport.onFinal((final) => finals.push(final));
    await transport.connect({ ...config, spokenLanguage: 'auto' });

    h.emit({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'a',
      transcript: 'Bonjour.',
    });
    // 'auto' means the model detected it and this transport was not told which.
    // Reporting 'auto' as a language would mislabel every segment.
    expect(finals[0]?.sourceLanguage).toBeUndefined();
  });
});

describe('the microphone', () => {
  it('opens on startAudio and closes on pause, stopAudio and disconnect', async () => {
    const h = harness();
    const transport = new WebRtcTranscriptionTransport(h.deps);
    await transport.connect(config);

    await transport.startAudio();
    expect(h.track.enabled).toBe(true);

    await transport.pause();
    expect(h.track.enabled).toBe(false);

    await transport.resume();
    expect(h.track.enabled).toBe(true);

    await transport.stopAudio();
    expect(h.track.enabled).toBe(false);
  });

  it('stops the tracks on disconnect, not just the connection', async () => {
    // Closing the peer connection alone leaves the browser's recording
    // indicator on. To anyone looking at their tab, that is an application
    // still listening to the room after they ended the session.
    const h = harness();
    const transport = new WebRtcTranscriptionTransport(h.deps);
    await transport.connect(config);
    await transport.startAudio();

    await transport.disconnect();

    expect(h.track.stopped).toBe(true);
    expect(h.peer.closed).toBe(true);
  });

  it('delivers nothing after disconnect', async () => {
    const h = harness();
    const transport = new WebRtcTranscriptionTransport(h.deps);
    const finals: string[] = [];
    transport.onFinal((final) => finals.push(final.text));
    await transport.connect(config);
    await transport.disconnect();

    h.emit({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'a',
      transcript: 'After the end.',
    });
    expect(finals).toHaveLength(0);
  });

  it('reports elapsed timings from the injected clock', async () => {
    const h = harness();
    const clock = vi.fn<() => number>();
    // startAudio() stamps the segment start; the final stamps its end.
    clock.mockReturnValueOnce(1_000).mockReturnValue(4_000);
    const transport = new WebRtcTranscriptionTransport(h.deps, clock);
    const finals: Array<{ startedAtMs?: number | undefined; endedAtMs?: number | undefined }> = [];
    transport.onFinal((final) => finals.push(final));

    await transport.connect(config);
    await transport.startAudio();
    h.emit({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'a',
      transcript: 'Une phrase.',
    });

    expect(finals[0]?.startedAtMs).toBe(1_000);
    expect(finals[0]?.endedAtMs).toBe(4_000);
  });
});

describe('parseProviderEvent', () => {
  it('ignores anything it does not recognise instead of throwing', () => {
    // One unrecognised frame must not end a session that is otherwise working.
    expect(parseProviderEvent('not json at all')).toEqual({ kind: 'ignored' });
    expect(parseProviderEvent('null')).toEqual({ kind: 'ignored' });
    expect(parseProviderEvent('[1,2,3]')).toEqual({ kind: 'ignored' });
    expect(parseProviderEvent(JSON.stringify({ type: 'session.created' }))).toEqual({
      kind: 'ignored',
    });
    expect(parseProviderEvent(new ArrayBuffer(8))).toEqual({ kind: 'ignored' });
    expect(parseProviderEvent(undefined)).toEqual({ kind: 'ignored' });
  });

  it('reads a transcription failure as an error with the provider vocabulary', () => {
    const parsed = parseProviderEvent(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.failed',
        error: { code: 'audio_too_short', message: 'Audio was too short' },
      }),
    );
    expect(parsed).toEqual({
      kind: 'error',
      code: 'audio_too_short',
      message: 'Audio was too short',
    });
  });

  it('still produces an error when the provider sends no detail', () => {
    const parsed = parseProviderEvent(JSON.stringify({ type: 'error' }));
    expect(parsed.kind).toBe('error');
  });
});
