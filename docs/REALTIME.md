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

Three implementations:

- **Mock** — plays fixtures. No microphone, no network, no account. This is what
  makes the whole product demonstrable and testable offline.
- **Web** — `getUserMedia` plus a WebSocket to the provider, using the ephemeral
  credential the API minted.
- **Mobile** — the same shape over the native audio module.

The server chooses which one a client should use and returns it in the token
response, so switching providers or transports is a server-side decision. See
ADR-0004 for why the mobile transport is what it is.

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
