# 6. Text translation, not speech-to-speech, in V1

**Status:** Accepted · 2026-07-31

## Context

Two ways to translate live speech: translate the recognised text with a fast
text model, or use a speech-to-speech realtime model. The second is more
impressive and much harder to make cheap, deterministic and testable.

## Decision

V1 translates **text**, from the canonical transcript.

- The transcription is the source of truth and is never overwritten by a
  translation. Translations are additive, keyed by `(segmentId, targetLanguage)`.
- Provisional translations are produced only for *stabilised* partials
  (`shouldTranslateProvisional`), never per character, and are replaced when
  the final segment arrives.
- Every translation is cached on
  `hash(finalText + sourceLanguage + targetLanguage + glossaryVersion)`.
- The model identifier lives in `OPENAI_TRANSLATION_MODEL` and has **no
  default**: pinning an alias in source code is how a product silently breaks
  when the alias is retired.

`SpeechTranslationProvider` is defined as a separate interface for a future
voice path, and is deliberately not surfaced in the V1 UI.

## Consequences

- Translation cost is proportional to distinct languages, not to participants.
- A translation failure degrades to showing the original text rather than
  showing nothing.
- Voice output can be added behind its own interface without touching the
  transcript pipeline.
