# Cost controls

A live transcription product has an unbounded failure mode: a forgotten tab
streaming audio for eleven hours, a script opening a thousand sessions, a bug
that translates into a language nobody is reading. None of these are malicious.
All of them are expensive.

Five independent layers, each of which alone would prevent a runaway bill.

## 1. Fan-out is per language, not per viewer

The structural one, and the reason the unit economics work at all.

```
one speaker turn
      │
      ▼
transcription  ×1
      │
      ▼
distinct reading languages in the room
      ├─ fr → en  ×1  → every EN reader
      ├─ fr → ar  ×1  → every AR reader
      └─ fr → pt  ×1  → every PT reader
```

Six viewers reading two languages cost **two** translations. Five thousand
viewers reading two languages still cost two. Cost scales with distinct
languages, and a room realistically has fewer than ten.

`hub.languagesFor(sessionId)` returns the languages actually being read right
now, so nothing is translated into a language nobody is reading. Asserted by an
integration test.

## 2. Translation cache

Keyed on `hash(text + sourceLanguage + targetLanguage + glossaryVersion)`.

Repeated phrases are extremely common in the situations this product serves —
"please take a seat", "do you have your card", a safety briefing given twenty
times a day. Including the glossary version in the key means a terminology change
invalidates exactly the affected entries and nothing else.

## 3. Quotas

Per role, per calendar month, all configurable:

| Setting                         | Default | Applies to                             |
| ------------------------------- | ------- | -------------------------------------- |
| `GUEST_MINUTES_PER_MONTH`       | 30      | No account                             |
| `FREE_MINUTES_PER_MONTH`        | 120     | Account, free                          |
| `PRO_MINUTES_PER_MONTH`         | 6 000   | Paid                                   |
| `MAX_PERSONAL_SESSION_MINUTES`  | 180     | One session's hard ceiling             |
| `MAX_DISCUSSION_LANGUAGES`      | 4       | Distinct languages in a discussion     |
| `MAX_BUSINESS_TARGET_LANGUAGES` | 12      | Distinct languages in a broadcast      |
| `SESSION_IDLE_TIMEOUT_SECONDS`  | 180     | Silence before a session closes itself |

The idle timeout is the one that catches the forgotten tab. `expiresAt` on the
session row catches the case where the client vanished without saying so.

None of these numbers is a constant in product code. All are environment
variables, and all can be overridden at runtime from the operator console
without a deploy.

## 4. The usage ledger, measured server-side

The client reports how much audio it thinks it sent. That number is a **hint**.

The billable quantity is the server's own measurement of the session window,
capped by the client's number when the client's is lower — because a pause
genuinely transmits no audio, and it would be wrong to bill for it.

A client that under-reports is billed the server's figure. There is a test for
exactly this.

Recorded per user, per period, per metric: audio seconds, translation
characters, and derived cost from `costRatesFor(env)`.

## 5. The circuit breaker

```
DAILY_COST_LIMIT_USD      default 50
MONTHLY_COST_LIMIT_USD    default 800
COST_CIRCUIT_BREAKER_ENABLED
```

When a limit is reached, new sessions are refused with `COST_LIMIT_REACHED` and
a message that says capacity is limited, not that the user did something wrong.
Sessions already running are not cut off mid-sentence.

This is the last line. Reaching it means one of the four layers above did not do
its job, and that is worth investigating rather than just raising the limit.

## Rates

`costRatesFor(env)` returns the per-unit rates used to derive cost. **These are
configuration, not knowledge**: provider pricing changes, and a hard-coded rate
becomes quietly wrong. `AI_PROVIDER=mock` uses zero rates, so development and
CI never accumulate phantom cost.

Verify the current rates against your provider's pricing page at deploy time and
whenever you change models.

## What a load test costs

Nothing. `run-load-test.mjs` refuses to run without the dev simulator, which
produces the same events with no provider call. Five thousand simulated viewers
cost zero provider dollars.

## Watching it

The operator console (`docs/ADMIN.md`) shows cost by day, by month, by plan and
by metric, with the circuit-breaker state and the distance to each limit. Every
figure is derived from the ledger, not estimated.

## Scaling

From the load scenarios, the bottlenecks appear in this order:

1. **WebSocket connections per instance.** The first wall. Raise `numInstances`;
   Redis pub/sub makes instances interchangeable, so this is safe and needs no
   coordination.
2. **Redis pub/sub throughput.** Every event crosses it. At the point this
   matters, shard by session id.
3. **Postgres write throughput on `transcript_segments`.** Every final segment is
   an insert. Batch inserts within a turn before considering anything larger.
4. **Provider rate limits.** Per-account, and the reason the translation cache
   and the per-language fan-out exist. This is where cost and capacity meet.

Run the scenarios against your own deployment before quoting numbers. The
thresholds in the k6 scripts are the product's requirements, not measurements of
somebody else's hardware.
