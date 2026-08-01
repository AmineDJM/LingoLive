# Realtime

## The endpoint

```
wss://<api-host>/realtime?token=<short-lived realtime token>
```

The token is minted by `POST /api/v1/realtime/translation-token` (or returned by
a business join), is scoped to one session, has a TTL measured in seconds and is
single-use — a replay guard burns it on connect.

## The protocol

A discriminated union on `type`, defined once in
`packages/contracts/src/realtime.ts` and imported by the API, the web app and the
mobile app. An unrecognised message is a parse failure, not an undefined
property read three frames later.

### Client → server

| Message                                   | Purpose                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `session.join`                            | Subscribe, declare reading language, declare last seen sequence          |
| `session.leave`                           | Unsubscribe cleanly                                                      |
| `session.pause` / `session.resume`        | Suspend or resume the speech stream                                      |
| `session.end`                             | End the session                                                          |
| `session.heartbeat`                       | Liveness; the hub prunes silent connections                              |
| `speaker.start` / `speaker.stop`          | Push-to-talk, per discussion tile                                        |
| `transcript.partial` / `transcript.final` | Text produced by the client's transport                                  |
| `language.set`                            | Change this connection's reading language                                |
| `slot.rotate`                             | Rotate one discussion tile                                               |
| `audio.usage`                             | Client's own measure of audio seconds (a hint; the server keeps its own) |

### Server → client

| Message                                     | Purpose                                                              |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `session.snapshot`                          | Everything since the client's last sequence, on connect or reconnect |
| `session.status`                            | Live / paused / ended                                                |
| `transcript.partial`                        | Provisional text, replaced by the final                              |
| `transcript.final`                          | Settled text with a sequence number                                  |
| `translation.partial` / `translation.final` | Translation into one target language                                 |
| `speaker.state`                             | Who is speaking now                                                  |
| `participant.count`                         | Viewer count                                                         |
| `usage.update`                              | Minutes remaining                                                    |
| `session.ended`                             | Room closed, with a reason                                           |
| `error`                                     | Code, message, and whether retrying makes sense                      |
| `pong`                                      | Heartbeat response                                                   |

## Sequencing and reconnection

Every final segment carries a monotonically increasing `sequence` within its
session.

```
client              server
  │  join(lastSequence: 41)  │
  ├─────────────────────────►│
  │                          │  looks up 42..n
  │  session.snapshot(42..57)│
  │◄─────────────────────────┤
  │  transcript.final(58)    │
  │◄─────────────────────────┤
```

A network drop produces a gap-free transcript, not a hole. The client does not
need to know how long it was gone.

Reconnection backoff is exponential with jitter, computed by `backoffDelayMs` in
`realtime-core` and unit-tested — including the case that matters: a socket that
opens and immediately fails must not reset the attempt counter, or the client
loops forever at full speed.

## The state machine

`realtime-core/state-machine.ts` holds a `TRANSITIONS` table. Illegal
transitions are impossible rather than merely unlikely:

```
idle ──TOKEN_REQUESTED──► requesting_token ──TOKEN_RECEIVED──► connecting
                                                                    │
                                                              CONNECTED
                                                                    ▼
                                        ┌───────────────────► connected
                                        │                           │
                              CONNECTION_LOST                 AUDIO_STARTED
                                        │                           ▼
                                  reconnecting ◄──────────────  streaming
                                        │                        │      ▲
                                    GIVE_UP                   PAUSED  RESUMED
                                        ▼                        ▼      │
                                     failed                    paused ───┘
```

`ENDED` and `ERROR` are reachable from anywhere. The reducer is pure and tested
in isolation, which is why the web and mobile clients behave identically without
sharing a line of UI code.

## Fan-out

The property everything else depends on:

```
one speaker turn
        │
        ▼
 transcription  ×1
        │
        ├─► broadcast source text to the whole room
        │
        ▼
 distinct reading languages currently subscribed
        │
        ├─► translate → en  ×1  ─► broadcast to every EN reader
        ├─► translate → ar  ×1  ─► broadcast to every AR reader
        └─► translate → pt  ×1  ─► broadcast to every PT reader
```

Cost scales with **distinct languages**, not with viewers. Six viewers reading
two languages cost two translations. An integration test asserts exactly this,
because it is the difference between a viable product and an unbounded bill.

`hub.languagesFor(sessionId)` is the primitive: the hub knows which languages
are actually being read right now, so nothing is translated into a language
nobody is reading.

## Multiple API instances

Redis pub/sub carries events between instances, so any instance can serve any
connection and `numInstances` can be raised without coordination.

Without `REDIS_URL` the API runs single-instance: rate limits are in-memory, the
replay guard is in-memory, and fan-out does not cross processes. It logs this at
startup. It is a supported way to run a small deployment, not a failure.

## Transports

```ts
interface RealtimeTranscriptionTransport {
  connect(config): Promise<void>;
  startAudio(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stopAudio(): Promise<void>;
  disconnect(): Promise<void>;
  onPartial(handler): void;
  onFinal(handler): void;
}
```

- **Mock** — plays fixtures. No microphone, no network, no account. This is what
  makes the whole product demonstrable and testable offline, and what the E2E
  suite runs against.
- **WebRTC** (`realtime-core/webrtc-transport.ts`) — the real one. A microphone,
  a peer connection to the provider, and the ephemeral credential the API
  minted.
- **Mobile** — not built. `apps/mobile` still constructs the mock
  unconditionally; the native app needs a WebRTC module, which is a native
  dependency and an EAS build, not a code change. See ADR-0004.

The server chooses, and the client obeys: `config.transport` comes back as
`mock` when no provider is configured and `webrtc` when one is. A client that
guessed would either ask for the microphone with nothing to send it to, or play
scripted speech on a deployment paying for a real provider.

### How the WebRTC transport is built

Every browser API it touches is injected as a small structural interface, so
`realtime-core` keeps its no-DOM rule and the whole protocol is tested without a
browser or an account. `apps/web/lib/browser-audio.ts` is the adapter over
`RTCPeerConnection`, `getUserMedia` and `fetch`, and is the only file that names
them.

```
connect()  ── requestMicrophone ──►  permission prompt, tracks start MUTED
           ── attachMicrophone  ──►  peer connection
           ── createDataChannel ──►  'oai-events'   (before the offer, or it is
           ── createOffer       ──►                  not negotiated into the SDP)
           ── exchangeSdp       ──►  POST config.sdpUrl, Bearer <ephemeral>
           ◄─ answer SDP        ──   setRemoteDescription
startAudio()                    ──►  tracks unmuted. Nothing before this point
                                     captures anything.
```

`config.sdpUrl` is built by the server from `OPENAI_REALTIME_URL` +
`OPENAI_REALTIME_SDP_PATH`, so a provider URL change is one environment variable
rather than a release of a web app, an iOS app and an Android app.

Two properties the tests pin, because neither is visible by looking:

- **The microphone is muted until `startAudio()`.** Connecting has to ask for
  permission — the offer needs a track — but it must not capture. Push-to-talk
  in Discuss is the same mechanism.
- **`disconnect()` stops the tracks**, not just the peer connection. Closing the
  connection alone leaves the browser's recording indicator lit, which is
  indistinguishable from an app still listening to the room.

Deltas are accumulated per provider `item_id` and cleared by that item's final,
so two overlapping utterances cannot be spliced into one line. An event that is
malformed or unrecognised is ignored rather than thrown: one bad frame must not
end a session that is otherwise working.

### Distance, and why it decides both latency and accuracy

The server computes two profiles per session kind, sends them to the provider
with the credential request, AND returns them to the client so its microphone
matches. They were computed and returned but never sent, so every session ran on
provider defaults — which is what "several seconds of latency and poor accuracy"
turned out to be.

|                                               | Listen (a room) | Discuss (a table) |
| --------------------------------------------- | --------------- | ----------------- |
| `turn_detection.silence_duration_ms`          | 600             | 900               |
| `noise_reduction`                             | `far_field`     | `near_field`      |
| Browser echo cancellation / noise suppression | **off**         | on                |

`turn_detection` is the single biggest lever on perceived latency: a transcript
is not settled until the provider decides the speaker stopped, so this is the
pause the reader waits through on every sentence.

The browser setting is the accuracy half, and it is counter-intuitive. Chrome's
audio chain is built for a phone call — one near talker, everything else is
noise to be removed. A lecturer three metres away is quiet and reverberant,
which is precisely what that suppressor attenuates, so the speech we want is
degraded before it leaves the machine and no provider-side setting recovers it.
Echo cancellation has nothing to cancel either: this app plays no audio. Gain
control stays on in both modes — it is what lifts a distant voice.

### CSP

`connect-src` must name the provider origin. The SDP exchange is an ordinary
`fetch`, and it is one of exactly two connections this server cannot proxy — the
other being the realtime WebSocket to the hub. `REALTIME_PROVIDER_ORIGIN`
defaults to `https://api.openai.com`.

## Minting the provider credential

`POST /api/v1/realtime/transcription-token` is the only place the standard
provider key is used. It returns a `config` containing a short-lived client
secret; `POST /api/v1/realtime/translation-token` returns a hub token only, for
clients that render someone else's transcript and never send audio.

The provider request body is **not** free-form, and getting it wrong is the one
failure this path cannot discover on its own: the mock provider never exercises
it, and a real attempt costs money and an account.

| `OPENAI_REALTIME_SESSION_PATH` | Body                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| `/client_secrets` (default)    | `session.audio.input.transcription.{model,language,prompt}` |
| `/transcription_sessions`      | `input_audio_transcription.{model,language,prompt}`         |

Both nest the model inside a `transcription` object. Sending `model` one level
up, at `session.audio.input`, is rejected as an unknown parameter — a 400 that
reached users as an unexplained error on the first tap of Listen. The shape
follows the configured path, so changing that one variable moves between the two
endpoints without a code change. `apps/api/src/ai/openai-provider.test.ts` pins
both shapes.

`spokenLanguage: 'auto'` is a LingoLive concept, not a language code: the field
is omitted entirely rather than sent as the string `auto`.

When the provider refuses, its `type`, `code` and `param` are logged and
returned in the error `details`, and the web client shows them next to the
request id. They are provider vocabulary — `invalid_api_key`, `model_not_found`,
a parameter path — and carry nothing anyone said. The provider's `message` is
logged but never returned: it quotes the value that caused the error, and
vocabulary hints are typed by the user.

## Partial text and accessibility

Partial text is visually distinct and is **never** announced to a screen reader.
Announcing every delta would make the app unusable with VoiceOver or TalkBack —
it would interrupt itself several times per second. Only finals are announced,
via a polite live region.

## Latency budget

| Stage                                            | Target      |
| ------------------------------------------------ | ----------- |
| Speech → first partial                           | < 400 ms    |
| Speech → final segment                           | < 1.2 s     |
| Final → translation delivered                    | < 800 ms    |
| **Speech → a reader sees translated text (p95)** | **< 2.5 s** |

The last row is the one that matters and it is the threshold the k6 scenario
asserts (`ll_first_line_ms: p(95) < 2500`). Beyond it, the product stops feeling
live and people start talking over it.
