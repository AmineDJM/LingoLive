# API

Base path `**/api/v1**`. JSON in, JSON out. Every request body is validated with
the Zod schema from `@lingolive/contracts` — the same schema the clients use to
build it.

## Conventions

**Authentication** — `Authorization: Bearer <access token>`. A guest token and an
account token are the same shape; the difference is what the actor is allowed to
do.

**Errors** — always this shape, for every failure, at every status:

```json
{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Monthly usage limit reached",
    "requestId": "req_01H..."
  }
}
```

`requestId` appears in the server log line for the same request. It is safe to
quote in a bug report; it contains nothing private.

**Caching** — every response carries `cache-control: no-store`.

## Health

| Method | Path             | Auth | Description                                                                                                              |
| ------ | ---------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/health`        | —    | Liveness. Never rate-limited.                                                                                            |
| GET    | `/ready`         | —    | Readiness with per-dependency detail: `database`, `redis`, `aiProvider`. Redis absent is `degraded`, not `failed`.       |
| GET    | `/api/v1/config` | —    | Public configuration: provider mode, whether translation is available, limits. Contains no secrets — asserted by a test. |

## Auth

| Method | Path          | Auth   | Description                                                                                                       |
| ------ | ------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/guest` | —      | Register a device-generated anonymous id, receive an access token. This is how the product works with no sign-up. |
| POST   | `/auth/link`  | Bearer | Attach an account to the current guest identity, keeping its history.                                             |

```http
POST /api/v1/auth/guest
{ "anonymousId": "anon_…", "platform": "ios", "appVersion": "1.0.0", "locale": "fr" }

200 { "accessToken": "…", "expiresAt": "…", "user": { "id": "…", "isGuest": true, "plan": "GUEST" } }
```

## Account

| Method | Path       | Auth   | Description                                                                    |
| ------ | ---------- | ------ | ------------------------------------------------------------------------------ |
| GET    | `/me`      | Bearer | The current actor, plan and entitlements.                                      |
| PATCH  | `/me`      | Bearer | Preferences: interface locale, theme, default reading language.                |
| DELETE | `/me`      | Bearer | Request deletion of everything. Processed by the worker; the response says so. |
| GET    | `/usage`   | Bearer | Minutes used and remaining for the current period.                             |
| GET    | `/history` | Bearer | Saved sessions only. Unsaved ones are not "hidden" — they are gone.            |

## Sessions

| Method | Path                     | Auth   | Description                                                                                           |
| ------ | ------------------------ | ------ | ----------------------------------------------------------------------------------------------------- |
| POST   | `/sessions`              | Bearer | Create. `kind` is `PERSONAL_LISTEN` or `PERSONAL_DISCUSS`. Discussion sessions carry `slots`. **201** |
| GET    | `/sessions/:id`          | Bearer | Read one. Ownership required; a non-owner gets 404, not 403.                                          |
| PATCH  | `/sessions/:id`          | Bearer | Rename.                                                                                               |
| POST   | `/sessions/:id/save`     | Bearer | The explicit save. Without it the transcript is purged.                                               |
| POST   | `/sessions/:id/end`      | Bearer | End; `reportedAudioSeconds` is a hint, the server keeps its own measure.                              |
| DELETE | `/sessions/:id`          | Bearer | Delete the session and everything under it.                                                           |
| GET    | `/sessions/:id/segments` | Bearer | Segments with translations, decrypted for the owner.                                                  |
| GET    | `/sessions/:id/export`   | Bearer | Plain-text export of a saved session.                                                                 |
| POST   | `/sessions/:id/segments` | Bearer | Append a final segment (used when a client transcribes locally).                                      |

```http
POST /api/v1/sessions
{
  "kind": "PERSONAL_DISCUSS",
  "readingLanguage": "fr",
  "slots": [
    { "position": 0, "readingLanguage": "fr",    "rotation": 0 },
    { "position": 1, "readingLanguage": "ar",    "rotation": 180 },
    { "position": 2, "readingLanguage": "en",    "rotation": 90 },
    { "position": 3, "readingLanguage": "pt-BR", "rotation": 270 }
  ]
}
```

## Realtime tokens

| Method | Path                          | Auth   | Description                                                                                          |
| ------ | ----------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| POST   | `/realtime/translation-token` | Bearer | Mint an ephemeral, single-use, session-scoped credential and tell the client which transport to use. |

```http
POST /api/v1/realtime/translation-token
{ "sessionId": "ses_…", "platform": "web", "preferredTransport": "auto",
  "spokenLanguage": "auto", "vocabularyHints": [] }

200 {
  "realtimeToken": "…",          // for OUR WebSocket, not the provider's
  "realtimeUrl": "wss://…/realtime",
  "config": { "transport": "…", "model": "…", "sampleRate": 24000, … },
  "expiresAt": "…"
}
```

The provider credential, when one is needed, is minted server-side and is
ephemeral. The API never returns the standing OpenAI key, and there is no code
path that could.

## LingoBusiness — participant side

Deliberately unauthenticated. Requiring an account to attend a talk someone
invited you to would be the wrong product.

| Method | Path                              | Auth     | Description                                                                                                                          |
| ------ | --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/business/sessions/:code`        | —        | Preview a 6-digit code before committing: title, organizer, source language, available reading languages.                            |
| POST   | `/business/join`                  | Optional | Join as a viewer. Returns a realtime token and URL. If a bearer token happens to be present the participation is associated with it. |
| POST   | `/business/sessions/:id/language` | —        | Change this viewer's reading language mid-session.                                                                                   |

Access codes accept human formatting: `728416`, `728 416` and `728-416` are the
same code.

Rate limiting here throttles _failed_ attempts, not joins — see
`docs/SECURITY.md` for why.

## Analytics

| Method | Path         | Auth   | Description                                                                                                              |
| ------ | ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/analytics` | Bearer | First-party event ingestion. Closed allow-list: an unknown event name is 422, an undeclared property is dropped. **204** |

## Development simulator

Mounted **only** when `ENABLE_DEV_SIMULATOR=true`, which the config schema
rejects in staging and production. A second runtime guard refuses the routes
even if that were bypassed.

| Method | Path                             | Description                                                                                                                                                   |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/dev/business/sessions`         | Create a broadcast room; returns the code, join URL, deep link and organizer token. **201**                                                                   |
| GET    | `/dev/business/sessions/:id`     | Inspect it.                                                                                                                                                   |
| POST   | `/dev/business/speak`            | Simulate the organizer speaking. Persists finals, translates into the languages viewers are _actually_ reading, fans out — exactly the path real audio takes. |
| POST   | `/dev/business/sessions/:id/end` | End it.                                                                                                                                                       |

This is what makes the participant side testable end to end without building the
organizer dashboard, and what lets load tests run without billing a provider.

## Admin

Every route requires the `ADMIN` role **and** an `X-Admin-Token` header. See
`docs/ADMIN.md` for what each one shows.

| Method | Path                                          | Description                                                                       |
| ------ | --------------------------------------------- | --------------------------------------------------------------------------------- |
| GET    | `/admin/overview`                             | Everything at a glance: live sessions, users, usage, cost, errors, provider state |
| GET    | `/admin/metrics`                              | Latency percentiles, throughput, error rate by route                              |
| GET    | `/admin/realtime`                             | Every open connection and room, live                                              |
| GET    | `/admin/users` · `/admin/users/:id`           | Accounts, plans, devices, usage, sessions                                         |
| PATCH  | `/admin/users/:id`                            | Change plan, grant entitlements, suspend                                          |
| DELETE | `/admin/users/:id`                            | Delete an account and everything under it                                         |
| GET    | `/admin/sessions` · `/admin/sessions/:id`     | Sessions with metadata; **content is not included by default**                    |
| POST   | `/admin/sessions/:id/reveal`                  | Decrypt and show transcript content. Requires a reason, is separately audited.    |
| POST   | `/admin/sessions/:id/end`                     | Force-end a running session                                                       |
| DELETE | `/admin/sessions/:id`                         | Delete a session                                                                  |
| GET    | `/admin/usage`                                | Usage and cost by period, plan and metric                                         |
| GET    | `/admin/analytics`                            | First-party analytics rollups                                                     |
| GET    | `/admin/business/codes` · POST `…/:id/revoke` | Access codes; revoke one                                                          |
| GET    | `/admin/config` · PATCH `/admin/config`       | Runtime tunables, changeable without a deploy                                     |
| GET    | `/admin/audit`                                | Every administrative action, who did it, when, and why                            |

## Status codes

| Code | Meaning here                                                               |
| ---- | -------------------------------------------------------------------------- |
| 200  | Success                                                                    |
| 201  | Created (sessions, business rooms)                                         |
| 204  | Accepted, nothing to return (analytics)                                    |
| 400  | Malformed request                                                          |
| 401  | Missing or invalid token                                                   |
| 403  | Authenticated but not allowed                                              |
| 404  | Not found — also returned instead of 403 where existence itself is private |
| 409  | Conflict (e.g. already ended)                                              |
| 413  | Body too large                                                             |
| 422  | Validation failed; `details.issues` lists the field paths                  |
| 429  | Rate limited                                                               |
| 500  | Server error; quote the `requestId`                                        |
| 503  | Temporarily unavailable (circuit breaker, provider outage)                 |
