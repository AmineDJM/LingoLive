# 8. Business fan-out: transcribe once, translate once per language

**Status:** Accepted · 2026-07-31

## Context

A LingoBusiness room has one speaker and potentially thousands of viewers
reading in a dozen languages. The naive implementation — one transcription or
one translation per viewer — makes cost scale with attendance and is
economically fatal at conference scale.

## Decision

Per source utterance, exactly:

1. **one** transcription, of the single source audio stream;
2. **one** translation per *distinct* target language currently subscribed
   (`dedupeTargetLanguages`);
3. fan-out of the same result to every viewer reading that language.

A room with 5 000 viewers across 8 languages costs 1 transcription + 8
translations per utterance, not 5 000 of anything.

Transport: an in-process hub backed by Redis pub/sub, so multiple API
instances share one logical room. The domain layer talks to a `RealtimeHub`
interface, so moving to a dedicated pub/sub tier later does not touch session
or transcript logic.

Reconnection is sequence-based: the client sends the last sequence it
rendered, the server replays exactly the gap. No duplicates, no holes.

## Consequences

- Adding the 5 001st viewer costs one WebSocket connection and zero model calls.
- Adding the 9th language costs one translation per utterance.
- Redis is required outside development; the config schema enforces it.
- Measured limits and the scale-out plan are in `docs/TESTING.md` (k6 results).
