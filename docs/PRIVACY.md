# Privacy

This document describes what the code does. It is not a privacy policy — that
lives in `docs/legal/privacy-policy.md` and needs a lawyer's review before
publication.

## The two promises

**Audio is never stored.** Not on the device, not on the server, not in a bucket,
not in a queue. It is streamed for transcription and discarded.

**Nothing is saved unless you ask.** A session you do not explicitly save is
deleted, not archived.

Both are properties of the code, not of a setting a user has to find.

## How "audio is never stored" is enforced

There is no audio column in the schema, no audio upload endpoint, no file write
of audio data anywhere in the repository. The audio buffer in `realtime-core` is
a bounded ring buffer that exists to smooth jitter and is overwritten
continuously.

CI greps for `audioUrl`, `audioPath`, `audioBlob`, `storeAudio`, `saveAudio` and
`uploadAudio` across `apps/`, `packages/` and `prisma/`, and fails the build if
any of them appears. Adding audio storage would therefore require deliberately
deleting a check, which is visible in a diff.

## What is stored, and for how long

| Data                                                 | Stored                                    | Retention                                       | Why it exists                                         |
| ---------------------------------------------------- | ----------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Audio                                                | **Never**                                 | —                                               | —                                                     |
| Transcript of an unsaved personal session            | Encrypted                                 | `RETENTION_UNSAVED_SESSION_HOURS` (default 1 h) | Reconnection and catch-up within the session          |
| Transcript of a _saved_ personal session             | Encrypted                                 | Until the user deletes it                       | The user asked for it                                 |
| Transcript of a business session                     | Encrypted                                 | `RETENTION_BUSINESS_SESSION_DAYS` (default 7 d) | Late joiners and reconnection                         |
| Translations                                         | Encrypted, same lifetime as their segment |                                                 |                                                       |
| Session metadata (kind, timings, language, duration) | Plain                                     | Same as the session                             | Quotas, billing, the operator console                 |
| Guest identity                                       | A hash of a client-generated id           | Until deletion                                  | Lets a device keep its own history without an account |
| Account e-mail                                       | Plain                                     | Until deletion                                  | Only if an account is created                         |
| Usage ledger (seconds, characters, cost)             | Plain                                     | Rolled up monthly                               | Quotas and cost control                               |
| Error events (code, route, status, request id)       | Plain, message truncated                  | `RETENTION_TECHNICAL_LOG_DAYS` (30 d)           | Debugging                                             |
| Analytics events                                     | Counts and enums only                     | 30 d                                            | Only if analytics is enabled                          |

Retention is executed by the worker process, not by a cron someone forgot to
set up. The jobs are also unit-tested: `purgeUnsavedSessions`, `expireAccessCodes`,
`processDeletionRequests`.

## Logs cannot carry what people said

`@lingolive/logging` applies two layers:

1. pino `redact` removes known-sensitive _paths_.
2. `scrubForLog()` removes forbidden _keys_ by name, at any depth, before any
   value reaches a sink.

The forbidden key list includes `text`, `originalText`, `translatedText`,
`transcript`, `segments`, `partial`, `delta`, `audio`, `prompt`, `messages` and
every token/credential name. A test feeds a realistic realtime payload through
it and asserts the content is gone and the correlation id survives.

Prisma query logging is disabled in every environment, because a query log
echoes parameter values — which for this product means transcript ciphertext and
identifiers.

## Analytics cannot carry what people said

Analytics is **off by default** (`ANALYTICS_ENABLED=false`). With it off,
nothing is built and nothing is sent.

With it on, the event catalogue is closed:

- An event name not in the catalogue is rejected.
- A property not declared for that event is dropped.
- A string value on a property that is not an enum property is dropped.

That last rule is the important one: it means even a declared property cannot be
repurposed to carry a sentence. The catalogue itself contains no free-text
property, and a test fails if one is added.

The analytics subject is a truncated one-way derivation of the actor, never the
user id and never the device hash — so the analytics store cannot join back to a
LingoLive account.

An integration test drives a real discussion session and asserts the outbound
payloads contain no transcript text, no user id, no device hash and no session
id.

## Error reporting cannot carry request content

Also off by default. When configured, what leaves the process is: the exception
type, a scrubbed message, and a few enum tags (request id, route, role, method,
error code). No request body, no headers, no query string, no user identity.

The scrubber removes API keys, JWT-shaped tokens, e-mail addresses, six-digit
codes and long quoted strings from the message.

## The browser cache

The service worker refuses to cache:

- anything under `/api/`,
- any request carrying an `Authorization` header,
- any cross-origin request,
- every product surface: `/listen`, `/discuss`, `/join`, `/history`,
  `/settings`, `/admin`.

These are rejected _before_ the caching logic runs, so a policy change cannot
accidentally start caching them. Every API response also carries
`cache-control: no-store`.

## Search engines

Every product surface is excluded in `robots.txt` **and** carries `noindex`
metadata — a page can be reached by a link `robots.txt` never sees. A non-production
deployment disallows everything.

## What the user can do

Inside the app, without contacting anyone:

- **See** what is stored: Settings shows the saved sessions and nothing hidden
  behind them.
- **Delete one transcript**: from history.
- **Delete everything**: Settings → Delete my data. This creates a deletion
  request that the worker processes; sessions, segments, translations,
  participants, devices and the account itself go.
- **Export**: a saved session can be exported as text.

No e-mail. No support ticket. No dark pattern. Account deletion is covered by an
integration test that asserts the rows are actually gone.

## Third parties

| Party                   | What it receives                              | When                                                       |
| ----------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| OpenAI                  | Audio for transcription; text for translation | Only with `AI_PROVIDER=openai`, only during a live session |
| Sentry (or compatible)  | Exception type, scrubbed message, enum tags   | Only if `SENTRY_DSN` is set                                |
| PostHog (or compatible) | Catalogue events, counts and language codes   | Only if `ANALYTICS_ENABLED=true` and a key is set          |

With `AI_PROVIDER=mock`, `SENTRY_DSN` empty and `ANALYTICS_ENABLED=false` — the
defaults — the product makes **no third-party network call at all**.

## Consent

LingoLive shows a permanent, unmissable recording indicator whenever a session
is live. That is a technical measure, not a legal one.

Whether everyone present has consented to being transcribed is the
responsibility of the person running the session, and the laws that govern it
differ by country and by context. The product says so in its terms; it does not
pretend to have solved it.

## What is not claimed

No claim is made that LingoLive is GDPR-, HIPAA- or otherwise compliant. Those
are properties of a deployment and an organisation, established by audit. What is
above is what the code does.
