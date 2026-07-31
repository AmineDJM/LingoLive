# 4. Mobile realtime transport

**Status:** Accepted · 2026-07-31

## Context

Web browsers can open a WebRTC peer connection straight to a realtime speech
API using a short-lived client secret, which is the lowest-latency path and
keeps audio off our servers. React Native has no built-in WebRTC; adding it
means `react-native-webrtc` plus a config plugin, a larger binary, and a
native dependency that must track every SDK upgrade.

The requirement that cannot bend: **the standard API key never reaches a
client.**

## Decision

Both platforms program against one interface,
`RealtimeTranscriptionTransport` (`packages/contracts/src/realtime.ts`), with
three implementations:

| Platform | Transport | Why |
|----------|-----------|-----|
| Web | WebRTC with an ephemeral client secret | Lowest latency; the browser already has the stack. |
| Mobile | **Native capture → WSS to the LingoLive API → provider** | No extra native dependency; one audio path to debug; the server owns sequencing, quota and cost accounting. |
| Tests / `AI_PROVIDER=mock` | In-process mock | Whole product runs with no provider account. |

Mobile is a deliberate one-hop-more design. The extra hop costs a few tens of
milliseconds; it buys a single place where usage is metered, translations are
deduplicated and a session can be cut off when a quota is reached — none of
which is enforceable if the client talks to the provider directly.

`react-native-webrtc` remains a future option: it plugs in behind the same
interface with no change to feature code. It is not in V1 because a native
dependency that must be revalidated on every Expo SDK upgrade is a real
maintenance cost, and the latency difference is not what makes or breaks this
product.

## Consequences

- The API is on the audio path for mobile and must be sized accordingly; this
  is covered by the k6 scenarios in `infra/scripts/load/`.
- Audio frames pass through the API but are **never written to disk** — see
  ADR 0007.
- Swapping transports is a one-file change plus a config flag.

Details of formats, sample rates, chunking, VAD and reconnection:
`docs/REALTIME.md`.
