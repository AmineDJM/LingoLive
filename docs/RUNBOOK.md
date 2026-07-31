# Runbook

For when something is wrong and you need it to not be wrong.

## First five commands

```bash
curl https://<api-host>/health     # is it alive
curl https://<api-host>/ready      # which dependency is unhappy
# operator console → Overview      # live sessions, errors, cost, circuit breaker
# operator console → Performance   # which route degraded, and when
# Render → Logs                    # grep the requestId a user gave you
```

Every user-visible error carries a `requestId`. It is the fastest path from "it
broke" to the exact log line, and it contains nothing private — ask for it.

---

## Nobody can start a session

**Check `/ready` first.**

| `checks` says        | Meaning                           | Do                                                                                                                     |
| -------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `database: failed`   | Postgres is unreachable           | Render → database status; connection limit; recent migration                                                           |
| `redis: degraded`    | Redis is down                     | **Not an outage.** Single-instance mode: fan-out no longer crosses instances. Scale to 1 instance until Redis is back. |
| `aiProvider: failed` | Provider unreachable or rejecting | Provider status page; check `OPENAI_API_KEY` and `OPENAI_TRANSLATION_MODEL`                                            |
| everything `ok`      | The problem is elsewhere          | Overview → circuit breaker; Configuration → `newSessionsEnabled`                                                       |

**If sessions are refused with `COST_LIMIT_REACHED`:** the circuit breaker
fired. Console → Usage & cost shows which limit and how it was reached. Raise
the limit from Configuration only after you know _why_ — the breaker firing means
four other layers did not stop something.

**If sessions are refused with `SERVICE_UNAVAILABLE`:** `newSessionsEnabled` is
off. Someone turned it off deliberately; find out who in the audit log.

---

## Transcription is slow or silent

1. Console → Performance → provider call latency and failure rate.
2. Console → Realtime → are connections open, are messages flowing?
3. Check the provider's status page.

If the provider is degraded, the honest move is to say so in the app rather than
let people sit in front of a blank screen. Configuration → `newSessionsEnabled`
off stops new sessions; running ones continue.

**If it is one user, not everyone:** almost always their network. The client
reconnects with exponential backoff and replays from its last sequence, so the
transcript will be gap-free once it returns.

---

## Viewers see nothing in a business session

Work down the fan-out chain:

1. Console → Realtime → does the room exist, and how many connections?
2. Are the languages viewers are reading in `languagesFor(sessionId)`?
3. Is the organizer producing segments at all?

The classic cause: viewers connected to **different API instances** while Redis
is down, so fan-out does not cross processes. `/ready` shows `redis: degraded`.
Scale to one instance until it recovers.

---

## Cost is climbing

1. Console → Usage & cost → top consumers, and by metric.
2. Console → Realtime → any room with an unreasonable number of distinct
   languages? Cost scales with distinct languages, so this is where an anomaly
   shows.
3. Any session running far longer than a human conversation? `MAX_PERSONAL_SESSION_MINUTES`
   and `SESSION_IDLE_TIMEOUT_SECONDS` should have caught it — if they did not,
   that is the bug.

**Immediate brake:** Configuration → lower `DAILY_COST_LIMIT_USD`. Takes effect
without a deploy.

**Then find the cause.** A rising bill with no rising user count is a bug, not
growth.

---

## Someone reports a wrong or offensive translation

1. Get the `requestId` or the session id. Never ask them to paste the text.
2. Console → Sessions → find it. Metadata first.
3. If you must see the content, use **Reveal** with a real reason. It is audited,
   and that is the point.
4. Machine translation gets things wrong. If it is systematic for a language
   pair, that is a model or glossary issue; if it is one sentence, it is noise.

Do not promise a fix you cannot make. The product says plainly that it is not a
certified interpreter.

---

## A join code leaked

Console → Business access codes → find it → **Revoke**. Immediate.

Everyone currently connected stays connected; the code stops admitting anyone
new. If that is not enough, force-end the session.

---

## A user wants their data gone, now

They can do it themselves: Settings → Delete my data, no ticket, no e-mail.

If they cannot reach the app: Console → Users → find them → Delete. This deletes
sessions, segments, translations, participants, devices, entitlements and the
account. It is real and it is not reversible.

Check `deletionRequestedAt` versus `deletedAt` to see whether the worker has
processed a self-service request. If requests are piling up, the worker is not
running — check the Render worker service.

---

## The worker is not running

Symptoms: unsaved sessions surviving past an hour, deletion requests not
completing, expired access codes still resolving.

```bash
# Render → lingolive-worker-<env> → Logs
# Look for: "LingoLive worker started" and each cycle
```

The jobs are idempotent. Restarting the worker catches everything up; nothing
needs manual repair.

---

## A migration failed mid-deploy

Render runs `prisma migrate deploy` as a **pre-deploy** command, so a failed
migration means the new instance never took traffic. The old one is still
serving.

1. Read the pre-deploy log for the actual SQL error.
2. Fix the migration in a branch. Do not edit an applied migration.
3. Redeploy.

If a migration partially applied, `prisma migrate resolve` marks it. Take a
backup before touching anything.

---

## The provider key may have leaked

Treat as an incident.

1. Revoke the key in the provider dashboard. First, before anything else.
2. Issue a new one; set it in Render on the **API service only**.
3. Redeploy the API.
4. Find out how: `pnpm check:secrets` locally, and the security workflow's
   history scan. If it is in the git history, the key is compromised regardless
   of whether the commit was reverted.
5. Check provider usage for calls you did not make.

---

## Suspected transcript exposure

1. Determine the path: logs, analytics, cache, backup, or the admin console.
2. Logs and analytics are structurally prevented — if content is there, a
   scrubber regressed. Find the commit and add the test that would have caught it.
3. Console → Audit log → who revealed what, and why.
4. A backup older than the stated retention window is itself the problem:
   restoring it restores transcripts that were supposed to be gone.

---

## Rolling back

**Server** — Render → the service → Rollback to the previous deploy. If the
release included a migration, confirm the previous code can read the new schema.
This is why migrations are additive first.

**Web** — same.

**Mobile** — an OTA update can revert JavaScript immediately
(`eas update --branch production` from the previous commit). A native change
needs a new binary through review, which is days. Plan mobile releases
accordingly.

---

## Escalating

Have ready before you ask anyone for help:

- the `requestId` or session id,
- what `/ready` says,
- the Overview and Performance screenshots,
- what changed recently — deploy, configuration change, provider incident.

"It is slow" is not a report. "p95 on `POST /sessions` went from 180 ms to 4 s at
14:20 UTC, right after the 14:18 deploy" is.
