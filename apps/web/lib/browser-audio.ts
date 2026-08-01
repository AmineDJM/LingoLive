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
 * Audio constraints.
 *
 * The browser's own processing is left ON. Speech recognition is trained on
 * ordinary microphone input, and these rooms — cafés, corridors, waiting rooms
 * — are exactly where echo cancellation and noise suppression earn their place.
 * Turning them off to "send the model cleaner audio" sends it noisier audio.
 */
function audioConstraints(sampleRateHz: number, channels: number): MediaStreamConstraints {
  return {
    audio: {
      channelCount: channels,
      sampleRate: sampleRateHz,
      echoCancellation: true,
      noiseSuppression: true,
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
    async requestMicrophone({ sampleRateHz, channels }): Promise<AudioStreamLike> {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error('This browser cannot capture audio'), {
          name: 'NotSupportedError',
        });
      }
      // Throws NotAllowedError when refused and NotFoundError when there is no
      // microphone. Both names reach the error reference unchanged, so the two
      // are distinguishable from a screenshot.
      const stream = await navigator.mediaDevices.getUserMedia(
        audioConstraints(sampleRateHz, channels),
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
