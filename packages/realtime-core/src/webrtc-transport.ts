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
 * The real transcription transport: a microphone, a peer connection, and the
 * ephemeral credential the API minted.
 *
 * Every browser and native API it touches is injected as a small structural
 * interface, so this file has no DOM dependency and the whole protocol —
 * offer/answer, event parsing, push-to-talk, teardown — is exercised by the
 * test suite without a browser or a provider account. `apps/web` supplies
 * adapters over `RTCPeerConnection` and `getUserMedia`; a native app can supply
 * its own without this logic being written twice.
 *
 * Two rules, both load-bearing:
 *
 *  1. The credential here is short-lived and session-scoped. The standard
 *     provider key never reaches a client, so a leak from this file is a leak
 *     of one session's minutes, not of the account.
 *  2. Audio is streamed, never stored. Nothing here writes a buffer to disk,
 *     to storage or into an event.
 */

// ---------------------------------------------------------------------------
// The platform surface, kept deliberately small
// ---------------------------------------------------------------------------

export interface AudioTrackLike {
  enabled: boolean;
  stop(): void;
}

export interface AudioStreamLike {
  getAudioTracks(): AudioTrackLike[];
}

export interface DataChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  onopen: (() => void) | null;
  close(): void;
}

export interface SessionDescriptionLike {
  readonly type: string;
  readonly sdp?: string | undefined;
}

export interface PeerConnectionLike {
  /** Attaches the stream from `requestMicrophone` as this connection's outbound audio. */
  attachMicrophone(stream: AudioStreamLike): void;
  createDataChannel(label: string): DataChannelLike;
  createOffer(): Promise<SessionDescriptionLike>;
  setLocalDescription(description: SessionDescriptionLike): Promise<void>;
  setRemoteDescription(description: { type: 'answer'; sdp: string }): Promise<void>;
  onconnectionstatechange: ((state: string) => void) | null;
  close(): void;
}

export interface WebRtcTransportDependencies {
  /** Prompts for the microphone and resolves with its stream. */
  requestMicrophone(constraints: {
    sampleRateHz: number;
    channels: number;
  }): Promise<AudioStreamLike>;
  createPeerConnection(): PeerConnectionLike;
  /** Posts the SDP offer and resolves with the answer SDP. */
  exchangeSdp(request: {
    url: string;
    offerSdp: string;
    clientSecret: string;
  }): Promise<{ ok: boolean; status: number; body: string }>;
}

/** The provider event names this transport understands. */
const PARTIAL_EVENT = 'conversation.item.input_audio_transcription.delta';
const FINAL_EVENT = 'conversation.item.input_audio_transcription.completed';
const FAILED_EVENT = 'conversation.item.input_audio_transcription.failed';

export type ParsedProviderEvent =
  | { kind: 'partial'; itemId: string; delta: string }
  | { kind: 'final'; itemId: string; transcript: string }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'ignored' };

/**
 * Provider event → something this product understands.
 *
 * Total by construction: an event that is malformed, unknown, or simply not
 * about transcription is `ignored` rather than thrown. A realtime stream is the
 * wrong place to be strict — one unrecognised frame must not end a session that
 * is otherwise working.
 */
export function parseProviderEvent(raw: unknown): ParsedProviderEvent {
  if (typeof raw !== 'string') return { kind: 'ignored' };

  let event: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { kind: 'ignored' };
    event = parsed as Record<string, unknown>;
  } catch {
    return { kind: 'ignored' };
  }

  const type = typeof event['type'] === 'string' ? event['type'] : '';
  const itemId = typeof event['item_id'] === 'string' ? event['item_id'] : '';

  if (type === PARTIAL_EVENT) {
    const delta = event['delta'];
    return typeof delta === 'string' && delta.length > 0
      ? { kind: 'partial', itemId, delta }
      : { kind: 'ignored' };
  }

  if (type === FINAL_EVENT) {
    const transcript = event['transcript'];
    // An empty final is silence the model decided was not speech. Dropping it
    // keeps blank lines out of the transcript.
    return typeof transcript === 'string' && transcript.trim().length > 0
      ? { kind: 'final', itemId, transcript }
      : { kind: 'ignored' };
  }

  if (type === FAILED_EVENT || type === 'error') {
    const detail = event['error'];
    const message =
      typeof detail === 'object' &&
      detail !== null &&
      typeof (detail as Record<string, unknown>)['message'] === 'string'
        ? ((detail as Record<string, unknown>)['message'] as string)
        : 'The transcription provider reported an error';
    const code =
      typeof detail === 'object' &&
      detail !== null &&
      typeof (detail as Record<string, unknown>)['code'] === 'string'
        ? ((detail as Record<string, unknown>)['code'] as string)
        : 'PROVIDER_EVENT_ERROR';
    return { kind: 'error', code, message };
  }

  return { kind: 'ignored' };
}

export class WebRtcTranscriptionTransport implements RealtimeTranscriptionTransport {
  private state: RealtimeState = 'idle';
  private config: TranscriptionConfig | null = null;
  private peer: PeerConnectionLike | null = null;
  private channel: DataChannelLike | null = null;
  private stream: AudioStreamLike | null = null;

  /** Accumulated deltas per provider item, cleared when its final lands. */
  private readonly partials = new Map<string, string>();

  private readonly partialHandlers = new Set<PartialHandler>();
  private readonly finalHandlers = new Set<FinalHandler>();
  private readonly stateHandlers = new Set<StateHandler>();
  private readonly errorHandlers = new Set<ErrorHandler>();

  private segmentStartedAtMs: number | null = null;

  constructor(
    private readonly deps: WebRtcTransportDependencies,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async connect(config: TranscriptionConfig): Promise<void> {
    this.config = config;

    this.setState('requesting_permission');
    this.stream = await this.deps.requestMicrophone({
      sampleRateHz: config.audio.sampleRateHz,
      channels: config.audio.channels,
    });

    // The microphone is live from this moment. It starts muted so that
    // connecting does not silently begin capturing before the user has pressed
    // anything — `startAudio()` is the only thing that opens it.
    this.setTracksEnabled(false);

    this.setState('connecting');
    const peer = this.deps.createPeerConnection();
    this.peer = peer;

    if (this.stream.getAudioTracks().length === 0) {
      throw this.fail('NO_AUDIO_TRACK', 'The microphone produced no audio track', false);
    }
    peer.attachMicrophone(this.stream);

    // The provider sends transcription events over this channel. It must exist
    // before the offer is created or it is not negotiated into the SDP.
    const channel = peer.createDataChannel('oai-events');
    this.channel = channel;
    channel.onmessage = (event) => this.handleProviderEvent(event.data);

    peer.onconnectionstatechange = (connectionState) => {
      if (connectionState === 'failed' || connectionState === 'disconnected') {
        this.setState('reconnecting');
        this.emitError({
          code: 'REALTIME_CONNECTION_LOST',
          message: 'The connection to the transcription provider dropped',
          retryable: true,
        });
      }
    };

    const offer = await peer.createOffer();
    if (!offer.sdp) {
      throw this.fail('SDP_OFFER_EMPTY', 'The browser produced no session description', false);
    }
    await peer.setLocalDescription(offer);

    const answer = await this.deps.exchangeSdp({
      url: config.sdpUrl,
      offerSdp: offer.sdp,
      clientSecret: config.clientSecret,
    });

    if (!answer.ok) {
      // The status is the diagnostic. 401 means the ephemeral credential was
      // rejected or had already expired; 404 means the exchange URL is wrong,
      // which is why the server builds it from configuration.
      throw this.fail(
        answer.status === 401 ? 'REALTIME_CREDENTIAL_REJECTED' : 'SDP_EXCHANGE_FAILED',
        `The transcription provider refused the connection (${answer.status})`,
        answer.status >= 500,
      );
    }

    await peer.setRemoteDescription({ type: 'answer', sdp: answer.body });
    this.setState('ready');
  }

  async startAudio(): Promise<void> {
    if (this.state === 'listening') return;
    this.setTracksEnabled(true);
    this.segmentStartedAtMs = this.now();
    this.setState('listening');
  }

  async stopAudio(): Promise<void> {
    this.setTracksEnabled(false);
    this.setState('ready');
  }

  async pause(): Promise<void> {
    this.setTracksEnabled(false);
    this.setState('paused');
  }

  async resume(): Promise<void> {
    if (this.state === 'listening') return;
    this.setTracksEnabled(true);
    this.setState('listening');
  }

  async disconnect(): Promise<void> {
    // Stopping the tracks is what turns the browser's recording indicator off.
    // Closing the peer connection alone leaves it on, which looks — reasonably
    // — like the microphone is still being listened to.
    for (const track of this.stream?.getAudioTracks() ?? []) track.stop();
    this.channel?.close();
    this.peer?.close();
    this.stream = null;
    this.channel = null;
    this.peer = null;
    this.partials.clear();

    this.setState('ended');
    this.partialHandlers.clear();
    this.finalHandlers.clear();
    this.stateHandlers.clear();
    this.errorHandlers.clear();
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

  private handleProviderEvent(data: unknown): void {
    const event = parseProviderEvent(data);

    if (event.kind === 'partial') {
      const text = (this.partials.get(event.itemId) ?? '') + event.delta;
      this.partials.set(event.itemId, text);
      this.segmentStartedAtMs ??= this.now();
      for (const handler of this.partialHandlers) {
        handler({ text, ...(this.sourceLanguage ? { sourceLanguage: this.sourceLanguage } : {}) });
      }
      return;
    }

    if (event.kind === 'final') {
      this.partials.delete(event.itemId);
      const startedAtMs = this.segmentStartedAtMs ?? this.now();
      this.segmentStartedAtMs = null;
      for (const handler of this.finalHandlers) {
        handler({
          text: event.transcript,
          ...(this.sourceLanguage ? { sourceLanguage: this.sourceLanguage } : {}),
          startedAtMs,
          endedAtMs: this.now(),
          // The provider's item id is stable, so a reconnect mid-flush cannot
          // duplicate a segment the server already recorded.
          clientSegmentId: event.itemId || undefined,
        });
      }
      return;
    }

    if (event.kind === 'error') {
      this.emitError({ code: event.code, message: event.message, retryable: true });
    }
  }

  /**
   * Only a language the user pinned is reported. When the session is set to
   * detect, the model's answer is authoritative and this transport does not
   * have it — claiming one here would mislabel the segment.
   */
  private get sourceLanguage(): string | undefined {
    const spoken = this.config?.spokenLanguage;
    return spoken && spoken !== 'auto' ? spoken : undefined;
  }

  private setTracksEnabled(enabled: boolean): void {
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = enabled;
  }

  private setState(next: RealtimeState): void {
    if (this.state === next) return;
    this.state = next;
    for (const handler of this.stateHandlers) handler(next);
  }

  private emitError(error: RealtimeTransportError): void {
    for (const handler of this.errorHandlers) handler(error);
  }

  /** Builds an error, announces it, and returns it to be thrown. */
  private fail(code: string, message: string, retryable: boolean): Error {
    this.setState('error');
    this.emitError({ code, message, retryable });
    return Object.assign(new Error(message), { code });
  }
}
