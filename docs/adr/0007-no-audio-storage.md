# 7. Audio is never persisted

**Status:** Accepted · 2026-07-31

## Context

LingoLive is pointed at meetings, medical waiting rooms, classrooms and
private conversations. Stored audio would be the single most damaging thing
this product could leak, and the least necessary: once a segment is
transcribed, the audio has no further use.

## Decision

Audio is never written to durable storage — not on the device, not on the
server, not in a queue, not in a log, not in an error report.

Enforced structurally rather than by policy:

- `Session.audioStored` is typed as `z.literal(false)` in the contract, so a
  client can assert it and any attempt to set it true is a type error.
- The reconnection buffer (`BoundedAudioBuffer`) is memory-only, bounded by
  duration, and cleared on every terminal transition.
- `scrubForLog()` drops `audio`, `buffer` and every transcript-shaped key
  before anything reaches a log sink; unit tests assert this.
- No object storage is provisioned in `infra/render.yaml`.

Transcript _text_ is different: kept only when the user explicitly saves it,
encrypted at rest with AES-256-GCM, deletable at any time.

## Consequences

- No "replay the audio" feature, ever, without revisiting this ADR.
- Model accuracy cannot be improved from production audio.
- The privacy claim on the marketing site is a structural property, not a
  promise.
