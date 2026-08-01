import type {
  AudioStreamLike,
  PeerConnectionLike,
  WebRtcTransportDependencies,
} from '@lingolive/realtime-core';

/**
 * The browser half of the real transcription transport.
 *
 * `realtime-core` owns the protocol and knows nothing about the DOM; this file
 * is the adapter, and it is the only place `RTCPeerConnection`, `getUserMedia`
 * and `fetch` appear. Written as explicit delegation rather than a cast:
 * the shapes are close enough to tempt one, and a cast here would silently
 * survive a browser API changing under it.
 */

/**
 * Audio constraints, which differ by how far away the voices are.
 *
 * The browser's processing chain is built for a phone call: one person talking
 * into their own device, everything else treated as noise to be removed. That
 * is right for Discuss, where people lean over one phone on a table.
 *
 * It is actively wrong for Listen. A lecturer three metres away arrives quiet
 * and reverberant — exactly what a voice-call noise suppressor is designed to
 * attenuate — so the speech we want is degraded before it ever leaves the
 * machine, and no amount of work on the provider side gets it back. Echo
 * cancellation has nothing to do here either: this app plays no audio, so
 * there is no echo, only a chance to remove signal.
 *
 * Gain control stays on in both: it is what lifts a distant voice.
 */
function audioConstraints(
  sampleRateHz: number,
  channels: number,
  noiseReduction: 'none' | 'near_field' | 'far_field',
): MediaStreamConstraints {
  const farField = noiseReduction === 'far_field';
  return {
    audio: {
      channelCount: channels,
      sampleRate: sampleRateHz,
      echoCancellation: !farField,
      noiseSuppression: !farField,
      autoGainControl: true,
    },
    video: false,
  };
}

/**
 * The stream handed back to `realtime-core`, carrying the real `MediaStream`
 * so the peer connection can send it.
 *
 * `realtime-core` treats the stream as opaque — it only ever mutes, unmutes and
 * stops tracks — and this is how the browser half gets the original back
 * without the shared code having to know what a `MediaStream` is.
 */
interface BrowserAudioStream extends AudioStreamLike {
  readonly native: MediaStream;
}

function isBrowserAudioStream(stream: AudioStreamLike): stream is BrowserAudioStream {
  return 'native' in stream;
}

export function createBrowserTransportDependencies(): WebRtcTransportDependencies {
  return {
    async requestMicrophone({ sampleRateHz, channels, noiseReduction }): Promise<AudioStreamLike> {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error('This browser cannot capture audio'), {
          name: 'NotSupportedError',
        });
      }
      // Throws NotAllowedError when refused and NotFoundError when there is no
      // microphone. Both names reach the error reference unchanged, so the two
      // are distinguishable from a screenshot.
      const stream = await navigator.mediaDevices.getUserMedia(
        audioConstraints(sampleRateHz, channels, noiseReduction),
      );
      const wrapped: BrowserAudioStream = {
        native: stream,
        getAudioTracks: () =>
          stream.getAudioTracks().map((track) => ({
            get enabled() {
              return track.enabled;
            },
            set enabled(value: boolean) {
              track.enabled = value;
            },
            stop: () => track.stop(),
          })),
      };
      return wrapped;
    },

    createPeerConnection(): PeerConnectionLike {
      const peer = new RTCPeerConnection();
      const adapter: PeerConnectionLike = {
        onconnectionstatechange: null,
        attachMicrophone(stream) {
          if (!isBrowserAudioStream(stream)) {
            throw new Error('attachMicrophone needs the stream from requestMicrophone');
          }
          for (const track of stream.native.getAudioTracks()) {
            peer.addTrack(track, stream.native);
          }
        },
        createDataChannel(label) {
          const channel = peer.createDataChannel(label);
          const wrapper: ReturnType<PeerConnectionLike['createDataChannel']> = {
            onmessage: null,
            onopen: null,
            close: () => channel.close(),
          };
          channel.onmessage = (event: MessageEvent) => wrapper.onmessage?.({ data: event.data });
          channel.onopen = () => wrapper.onopen?.();
          return wrapper;
        },
        async createOffer() {
          const offer = await peer.createOffer();
          return { type: offer.type, sdp: offer.sdp };
        },
        async setLocalDescription(description) {
          await peer.setLocalDescription({
            type: description.type as RTCSdpType,
            ...(description.sdp ? { sdp: description.sdp } : {}),
          });
        },
        async setRemoteDescription(description) {
          await peer.setRemoteDescription({ type: 'answer', sdp: description.sdp });
        },
        close: () => peer.close(),
      };
      peer.onconnectionstatechange = () => adapter.onconnectionstatechange?.(peer.connectionState);
      return adapter;
    },

    async exchangeSdp({ url, offerSdp, clientSecret }) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          // The ephemeral credential, valid for this session and about a
          // minute. Never the account key — that exists only on the server.
          authorization: `Bearer ${clientSecret}`,
          'content-type': 'application/sdp',
        },
        body: offerSdp,
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    },
  };
}
