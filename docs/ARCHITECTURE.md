# Architecture

## The shape

```
   iOS / Android              Web browser / PWA
   (Expo, RN 0.86)            (Next.js 16, React 19)
          │                            │
          │  HTTPS + WebSocket         │
          └──────────────┬─────────────┘
                         ▼
            ┌────────────────────────┐
            │  API (Fastify 5)       │
            │  REST + /realtime WS   │
            │  ── the only place a   │
            │     provider key lives │
            └───┬────────┬───────┬───┘
                │        │       │
        ┌───────▼──┐  ┌──▼────┐  └────────► OpenAI
        │PostgreSQL│  │ Redis │            (transcription,
        │  Prisma  │  │pub/sub│             translation)
        └──────────┘  └───────┘
                ▲
        ┌───────┴────────┐
        │ Worker         │  retention, expiry, deletion,
        │ (same context) │  cost roll-up
        └────────────────┘
```

Four deployable units, one repository, one set of contracts.

## Monorepo layout and why

pnpm workspaces + Turborepo. The reason is not fashion: the mobile app, the web
app and the API must agree on the shape of a transcript segment, the list of
languages, the error codes and the realtime protocol. When those live in one
`packages/contracts` compiled once and imported by all three, a mismatch is a
type error rather than a bug a user finds.

| Package         | What it owns                                                                              | Why it is separate                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `contracts`     | Zod schemas: languages, sessions, transcripts, realtime protocol, errors, entitlements    | One definition per shape, used by API validation _and_ client types                                       |
| `design-tokens` | Colour, spacing, radius, motion, touch targets                                            | The web (CSS variables) and native (objects) render from the same numbers; contrast is asserted by a test |
| `i18n`          | 7 locales of UI copy                                                                      | No hard-coded strings; a missing key is a type error                                                      |
| `realtime-core` | State machine, transcript store, transport interface, discussion layout maths, deep links | The hardest logic, tested once, shared by both clients                                                    |
| `api-client`    | Typed HTTP client                                                                         | Web and mobile call the API the same way                                                                  |
| `config`        | Environment schema + production hardening                                                 | One place decides what a valid deployment is                                                              |
| `logging`       | Structured logs with content scrubbing                                                    | Privacy enforced at the sink, not at every call site                                                      |
| `observability` | Optional analytics + error reporting                                                      | Off by default; closed event catalogue                                                                    |

`packages/typescript-config` holds the shared compiler settings. `packages/testing`
holds shared test utilities.

## The API

Fastify 5, because the realtime path matters: it has first-party WebSocket
support, low per-request overhead, and a plugin model that keeps the security
middleware explicit rather than magical.

- **Validation** — every request body is parsed with the same Zod schema the
  clients use. There is no second, drifting JSON-Schema definition.
- **Errors** — one error handler produces `{ error: { code, message, requestId } }`
  for everything. A 5xx never carries a stack trace, a query, a prompt or a
  transcript. Tests assert this.
- **Rate limiting** — keyed by identity when there is one, by IP otherwise, so a
  shared NAT does not throttle everyone behind it.
- **Auth** — HMAC-signed, purpose-scoped tokens (`access`, `refresh`, `realtime`,
  `business_join`, `organizer`). A token minted for one purpose cannot be
  replayed for another. See `docs/SECURITY.md`.
- **Context** — one injectable `AppContext` carries every dependency, which is
  what lets the integration tests run the real application, with a real
  database and a real hub, without binding a port.

### Modules

| Module           | Responsibility                                                        |
| ---------------- | --------------------------------------------------------------------- |
| `sessions`       | Lifecycle, ownership, save/rename/delete, discussion slots            |
| `transcripts`    | Segment persistence, encryption, translation storage, export          |
| `business`       | Access codes, previews, joining, viewer languages                     |
| `usage`          | Ledger, quotas, cost measurement, circuit breaker                     |
| `auth`           | Guest registration, account linking, actor resolution                 |
| `metrics`        | In-process latency/throughput/error registry for the operator console |
| `runtime-config` | Database-backed overrides for tunables, changeable without a deploy   |
| `code-guard`     | Throttles _failed_ access-code attempts, not joins                    |
| `jobs`           | Retention, expiry, deletion processing, cost roll-up                  |

## Realtime

One WebSocket endpoint, `/realtime`, authenticated by a short-lived
purpose-scoped token in the query string. The protocol is a discriminated union
defined in `contracts/realtime.ts`, so an unknown message is a parse failure
rather than an undefined property.

The hub is the fan-out primitive:

```
speaker turn
     │
     ▼
transcription (once)
     │
     ├── broadcast to everyone            (source text)
     │
     ▼
distinct target languages of the room
     │
     ├── translate fr → en   (once) ──► broadcast to all EN readers
     ├── translate fr → ar   (once) ──► broadcast to all AR readers
     └── translate fr → pt   (once) ──► broadcast to all PT readers
```

Six viewers reading two languages cost two translations. This is asserted by a
test, because it is the property the whole cost model depends on.

Cross-instance delivery goes through Redis pub/sub, which is what makes API
instances interchangeable. Without Redis the API still runs — single-instance,
with in-memory rate limits and no cross-instance fan-out — and says so at
startup rather than failing.

Reconnection is sequence-based: the client remembers the last sequence it saw,
and the server replays from there. A dropped connection produces a gap-free
transcript, not a hole. See `docs/REALTIME.md`.

## AI providers

An interface, two implementations:

```ts
interface TranscriptionProvider { createSession(...): RealtimeTranscriptionTransport }
interface TranslationProvider   { translate(...): Promise<Translation> }
```

- **`mock`** — deterministic fixtures. Drives the entire product with no
  account, no network and no cost. This is the default, it is what CI runs, and
  it is what makes the product demonstrable on a plane.
- **`openai`** — real transcription and translation.

The transcription model defaults to `gpt-live-transcribe` and is configurable.
The translation model has **no default on purpose**: model identifiers change,
and a stale hard-coded alias is a production outage. A deployment sets the
identifier that is current for its account.

`AI_PROVIDER=mock` is rejected in production by the config schema.

### Where the provider key lives

On the server. Only on the server.

The mobile app and the browser never see it. They ask the API for an ephemeral,
short-lived credential scoped to one session; the API mints it, having
authenticated the caller and checked their quota. This is enforced by a lint
rule on the variable name, a scan of the built bundles, and a scan of the git
history — see `docs/SECURITY.md`.

## Web

Next.js 16 App Router. Two route groups under `app/[locale]/`:

- `(marketing)` — statically renderable, indexed, localized, with `hreflang`,
  a localized sitemap and JSON-LD emitted only where there is content to
  describe.
- `(app)` — the product. `noindex` at the metadata level _and_ in `robots.txt`,
  because a page can be reached by a link `robots.txt` never sees.

Locale routing lives in `proxy.ts` (Next 16's name for what used to be
`middleware.ts`). Tailwind 4 consumes the design tokens through
`@theme inline` over `--ll-*` custom properties, so the CSS and the native
styles cannot drift.

The PWA service worker is structurally unable to cache anything private: API
responses, authorized requests and every product surface are refused before the
caching logic is reached.

## Mobile

Expo SDK 57, Expo Router, React Native 0.86, development builds (not Expo Go —
the audio and camera modules require native code). Native fonts, native
navigation gestures, minimal permissions, `runtimeVersion: fingerprint` so an
OTA update can never reach a binary whose native code does not match.

## Data

PostgreSQL 16 via Prisma 6. Transcript and translation text is encrypted at the
application layer with AES-256-GCM before it reaches the database, under a
versioned key prefix (`v1.iv.tag.ct`) so keys can be rotated without a
downtime window. See `docs/DATABASE.md` and `docs/SECURITY.md`.

## Worker

A separate process running the same maintenance jobs the API exposes, on an
interval. Deleting unsaved sessions is not a background nicety here — it is the
mechanism that makes the privacy promise true, so it runs in its own process
that cannot be starved by request traffic.

## Divergences from the requested stack

Everything requested is used. Two things are worth stating explicitly:

1. **TanStack Query is not used in the web app.** The product's data is pushed
   over a WebSocket, not polled over HTTP; the two fetches that exist are
   `use`-based server components and one client hook. Adding a cache layer for
   two requests would be more moving parts, not fewer. TanStack Query remains
   the right choice the moment there is a list-and-detail surface to cache.
2. **Error reporting does not use the Sentry SDK.** It speaks Sentry's documented
   envelope protocol directly, in ~150 lines, so that what leaves the process is
   exactly what a unit test asserts. See ADR-0011.

Both are recorded as ADRs with the alternatives considered.

## Versions

| Component    | Version |
| ------------ | ------- |
| Node         | 22.20.0 |
| pnpm         | 10.33.0 |
| TypeScript   | 5.9.3   |
| Fastify      | 5.11.0  |
| Prisma       | 6.19.3  |
| PostgreSQL   | 16      |
| Next.js      | 16.2.12 |
| React        | 19.2.8  |
| Expo SDK     | 57      |
| React Native | 0.86    |
| Zod          | 4.4.3   |
| Tailwind     | 4.3.3   |
| Vitest       | 4.1.10  |
| Playwright   | 1.62.1  |

All pinned exactly. No `^`, no `~`.
