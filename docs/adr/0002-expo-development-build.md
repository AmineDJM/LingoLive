# 2. Expo with a Development Build, not Expo Go

**Status:** Accepted · 2026-07-31

## Context

The mobile app needs native capabilities that Expo Go's fixed binary does not
include: low-latency audio capture, secure storage for the anonymous identity,
a camera-based QR scanner, universal/app links, and later in-app purchases.

## Decision

Expo SDK 57 with **Development Builds** (`expo-dev-client`), built and
distributed through EAS Build. Expo Go is not a supported development target.

Modules chosen, all from the officially maintained Expo set:

| Need                          | Module                                               |
| ----------------------------- | ---------------------------------------------------- |
| Audio capture                 | `expo-audio` (the supported successor to `expo-av`)  |
| QR scanning                   | `expo-camera` (`expo-barcode-scanner` is deprecated) |
| Anonymous identity            | `expo-secure-store` (Keychain / Keystore)            |
| Haptics                       | `expo-haptics`                                       |
| Deep links                    | `expo-linking` + Expo Router                         |
| Screen awake during a session | `expo-keep-awake`                                    |
| Device locale                 | `expo-localization`                                  |

## Alternatives considered

- **Bare React Native.** More control, and we would own the whole native
  build pipeline. EAS Build gives us signed iOS builds without a Mac in the
  loop, which matters more.
- **Expo Go only.** Would force us to drop native audio and WebRTC entirely.

## Consequences

- Contributors run `eas build --profile development` once per platform, then
  iterate over the JS bundle normally.
- CI can build both platforms without a macOS runner.
- Any new native module requires a new development build — flagged in
  `docs/DEPLOYMENT.md` and enforced by the fingerprint check in
  `eas-update.yml`, so an OTA update can never ship a JS bundle that expects
  native code the installed binary does not have.
