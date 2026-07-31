# 5. Pluggable `AuthAdapter` with a local development mode

**Status:** Accepted · 2026-07-31

## Context

The product must (a) work with no account at all, (b) support Sign in with
Apple, Google and e-mail sign-in when the user chooses to create one, and
(c) be developable and testable by someone with no external identity provider
configured.

Apple's guidelines require Sign in with Apple when other third-party sign-in
options are offered on iOS.

## Decision

Never hand-roll password authentication. Instead, an `AuthAdapter` interface
with two implementations selected by `AUTH_PROVIDER`:

- `local` — signs its own short-lived JWTs with `AUTH_SECRET`. Development and
  test only; the configuration schema **refuses to boot** with this in staging
  or production.
- `oidc` — verifies provider-issued identity tokens against a JWKS endpoint.
  Apple, Google and e-mail OTP all arrive through this path.

Guests are first-class: a 128-bit random `anonymousId` generated on-device and
kept in Keychain/Keystore (never an advertising identifier) is exchanged for a
guest token. Linking a guest to a real account carries the guest's sessions
across.

## Consequences

- `pnpm dev` works with zero external accounts.
- Adding a provider is one adapter, no changes to routes or clients.
- Apple/Google client IDs are release-time configuration, listed in
  `docs/DEPLOYMENT.md` as credentials the operator must supply.
- LingoBusiness participants never authenticate at all.
