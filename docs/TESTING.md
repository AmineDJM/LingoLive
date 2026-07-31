# Testing

## What exists

| Suite               | Where                    |       Count | What it proves                                                |
| ------------------- | ------------------------ | ----------: | ------------------------------------------------------------- |
| Contracts           | `packages/contracts`     |          18 | Language handling, code normalisation, dedup, schema shapes   |
| Design tokens       | `packages/design-tokens` |          18 | Every colour pair meets WCAG AA, in both themes               |
| i18n                | `packages/i18n`          |          17 | Every locale has every key; no locale drifts                  |
| Config              | `packages/config`        |          25 | Production hardening actually rejects unsafe configurations   |
| Logging             | `packages/logging`       |          10 | Transcript content cannot reach a log sink                    |
| Realtime core       | `packages/realtime-core` |          51 | State machine, ordering, reconnection, backoff, layout maths  |
| API client          | `packages/api-client`    |          12 | Request shapes, error mapping, token refresh                  |
| Observability       | `packages/observability` |          24 | Analytics and error reporting cannot carry content            |
| Web content         | `apps/web`               |           7 | Every marketing page exists in every locale with real content |
| **API integration** | `apps/api/tests`         |     **120** | Sessions, business join, admin, realtime, privacy, quotas     |
| **Web E2E**         | `apps/web/e2e`           |      **29** | The product, in a browser, against a real API                 |
| Mobile flows        | `apps/mobile/.maestro`   |     5 flows | First launch, listen, discuss, join, accessibility            |
| Load                | `infra/scripts/load`     | 2 scenarios | Fan-out at 100 / 1 000 / 5 000 viewers; HTTP baseline         |

## Running them

```bash
pnpm test                    # everything unit and integration
pnpm test:e2e                # Playwright — needs the app running
pnpm test:load               # k6 — install k6 separately
pnpm check:all               # format, lint, types, tests, secret scan

pnpm --filter @lingolive/api test          # one package
pnpm --filter @lingolive/api test:watch
```

The API integration tests need a PostgreSQL. `pnpm bootstrap` provides one;
`ensureSchema()` applies migrations once per run.

## How the API tests work

They drive the **real application** — real routes, real database, real hub —
through `app.inject()`, without binding a port. Every dependency comes from one
injectable `AppContext`, which is what makes that possible.

Two deliberate choices in the harness:

**Redis is stripped.** Vitest auto-loads `.env`, so a developer's local
`REDIS_URL` would leak in and the tests would silently stop exercising the
single-instance fallback paths. The harness destructures it out.

**Third-party delivery is recorded, not mocked away.** Analytics and error
reporting are replaced by recorders, so a test can assert on the exact payloads
that _would_ leave the process rather than trusting the vendor client to behave.

## The tests that encode product promises

These are not coverage. Each one fails if a specific promise stops being true.

| Promise                                                 | Test                                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Six viewers reading two languages cost two translations | `realtime.test.ts` — the entire cost model                                                                                                          |
| An unsaved session is deleted, not archived             | `privacy-quotas.test.ts` — runs the retention job and checks the rows are gone                                                                      |
| Account deletion actually deletes                       | `privacy-quotas.test.ts` — asserts sessions, segments, devices and the user are gone                                                                |
| Analytics cannot carry what people said                 | `privacy-quotas.test.ts` — drives a real discussion, asserts no transcript text, no user id, no device hash, no session id in the outbound payloads |
| Logs cannot carry what people said                      | `privacy-quotas.test.ts` — a realistic realtime payload through the scrubber                                                                        |
| A 5xx never leaks a stack trace                         | `privacy-quotas.test.ts`                                                                                                                            |
| The public config advertises no secret                  | `privacy-quotas.test.ts`                                                                                                                            |
| A non-owner learns nothing about a session's existence  | `sessions.test.ts` — 404, not 403                                                                                                                   |
| A conference behind one NAT can all join                | `business.test.ts` — the failure-throttling guard                                                                                                   |
| A guessed code is throttled                             | `business.test.ts`                                                                                                                                  |
| Billing is server-measured, not client-reported         | `privacy-quotas.test.ts` — an under-reporting client is capped by the server's own measure                                                          |
| Revealing a transcript is audited                       | `admin.test.ts`                                                                                                                                     |
| Every colour pair meets AA                              | `design-tokens/index.test.ts`                                                                                                                       |

## End-to-end

Playwright, Chromium, desktop and mobile viewports, `reducedMotion: 'reduce'` so
the suite measures behaviour and not animation timing.

```bash
# API in mock mode + built web app
AI_PROVIDER=mock ENABLE_DEV_SIMULATOR=true pnpm dev:api

# The suite asserts the production-shaped robots.txt, so indexing is explicitly
# on rather than inferred from the environment name.
export NEXT_PUBLIC_ALLOW_INDEXING=true
pnpm --filter @lingolive/web build && pnpm --filter @lingolive/web start

pnpm test:e2e
```

Set `PLAYWRIGHT_CHROMIUM_PATH` if your environment ships a Chromium that does not
match Playwright's expected revision.

The suite covers: localized routing and `hreflang`, the sitemap, JSON-LD,
`robots.txt`, the offline fallback, the three actions, a 2/3/4-person discussion
with rotation, Arabic RTL inside a rotated tile, join by code, and account
deletion from inside the app.

### Four real bugs it found

Worth recording, because they are the argument for running E2E at all — none of
them was visible by reading the code:

1. `/offline` was locale-redirected (307), breaking the service worker fallback
   it exists to serve.
2. The language switcher always returned to the locale home page instead of
   staying on the current page.
3. The Discuss canvas overflowed the viewport instead of fitting it.
4. A full-width tile rotated 90° rendered off screen.

## Mobile flows

Maestro, in `apps/mobile/.maestro/`:

```bash
maestro test apps/mobile/.maestro/first-launch.yaml
maestro test apps/mobile/.maestro/            # all of them
```

`accessibility.yaml` walks the app through the accessibility tree and asserts
labels and touch-target sizes on a real device — the thing a unit test cannot
check.

## Load

```bash
node infra/scripts/run-load-test.mjs --profile 100
node infra/scripts/run-load-test.mjs --profile 1000
node infra/scripts/run-load-test.mjs --profile 5000
node infra/scripts/run-load-test.mjs --baseline
```

The driver creates a simulated business session through the dev simulator first,
so **a load test can never bill a provider account**. It refuses to run without
it.

Thresholds encode the product promise, not a vanity number:

| Metric                  | Threshold  | Why                                     |
| ----------------------- | ---------- | --------------------------------------- |
| `ll_first_line_ms` p95  | < 2 500 ms | Beyond this it stops feeling live       |
| `ll_join_success`       | > 99 %     | A viewer who cannot join has no product |
| `http_req_duration` p95 | < 800 ms   |                                         |

## CI

`ci.yml` runs five jobs:

1. **static** — Prettier, ESLint, TypeScript across the monorepo
2. **test** — unit and integration against a real Postgres and Redis, plus a
   check that the migrations reproduce the schema from empty, plus the seed
3. **build** — every app, then `check:secrets` **against the emitted bundles**
4. **e2e** — real API, real Next.js server, real browser
5. **mobile** — typecheck, lint, and Expo config resolution (which catches an
   invalid `app.config.ts` before it costs a 30-minute EAS build)

`security.yml` adds the secret scan over the full git history, a dependency
audit, CodeQL, and three privacy invariants: the service worker cannot cache
private data, every product surface is excluded from indexing, and nothing in
the repository looks like it stores audio.

## Writing a new test

- Test the promise, not the implementation. "An unsaved session is deleted" is a
  test; "`purgeUnsavedSessions` calls `deleteMany`" is not.
- Prefer the integration harness for anything touching persistence. It is fast
  enough, and it catches the schema mismatches unit tests do not.
- If you are adding something that touches transcripts, tokens or the provider
  key, add the assertion that it cannot leak — that is the class of bug this
  codebase is most afraid of.
