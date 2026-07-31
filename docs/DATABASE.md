# Database

PostgreSQL 16, Prisma 6.19.3. Schema at `prisma/schema.prisma`, migrations at
`prisma/migrations/`.

## Model map

```
User ──┬── Device            (hashed anonymous id; one account, many devices)
       ├── Entitlement       (plan, source, expiry)
       ├── Session ──┬── SpeakerSlot        (discussion tiles)
       │             ├── Participant        (business viewers)
       │             ├── TranscriptSegment ── Translation
       │             └── BusinessAccessCode (hashed 6-digit code)
       ├── UsageLedger       (seconds, characters, cost)
       ├── AnalyticsEvent    (counts and enums only)
       └── DeletionRequest

AdminAuditLog    every administrative action
ConfigOverride   runtime tunables, changeable without a deploy
ErrorEvent       code, route, status, request id — message truncated
```

## The models that carry the product's promises

### `User`

`isGuest` defaults to true: a guest is a first-class user with no credentials,
not a degraded state.

`autoSaveTranscripts` defaults to **false**. This is the field that encodes
"nothing is kept unless you ask".

`deletionRequestedAt` and `deletedAt` are separate: the first is the user's
request, the second is the completed irreversible purge. Between them the worker
does the work, and the user can see that it is happening.

### `Device`

`anonymousIdHash` is the hash of a 128-bit value the client generates for
itself. Never an advertising identifier, never the vendor id, never the IDFA.
Stored hashed so a database leak does not expose the device identities
themselves.

### `Session`

`saveRequested` is the only thing that keeps a personal transcript alive. The
retention job deletes sessions where it is false and which are older than
`RETENTION_UNSAVED_SESSION_HOURS`.

`expiresAt` is set at creation from `MAX_PERSONAL_SESSION_MINUTES`, so a session
whose client vanished still expires instead of holding resources forever.

`kind` is `PERSONAL_LISTEN`, `PERSONAL_DISCUSS` or `BUSINESS_BROADCAST`.

Ownership is dual: `ownerUserId` for accounts, `anonymousOwnerHash` for guests.
A guest owns their sessions without an account existing.

### `TranscriptSegment` and `Translation`

`originalText` and `translatedText` are **ciphertext**, not plaintext:

```
v1.<iv-base64>.<authTag-base64>.<ciphertext-base64>
```

AES-256-GCM, applied in the application layer before the value reaches Postgres.
The version prefix is what makes key rotation possible without a downtime window
— see `docs/SECURITY.md#key-rotation`.

`sequence` is monotonic within a session and is what reconnection replays from.

### `BusinessAccessCode`

The 6-digit code is stored **hashed**, so the database cannot be read to harvest
live session codes. It has an expiry (`BUSINESS_CODE_TTL_HOURS`) and a revoked
flag; the expiry job clears stale ones.

### `UsageLedger`

Server-measured. The client reports what it thinks it used; the ledger records
what the server measured, capped by the client's number when that is lower
(a pause genuinely transmits no audio). Metrics: audio seconds, translation
characters, and derived cost.

This is the table quotas and the cost circuit breaker read.

### `AdminAuditLog`

Every administrative action: who, when, what, and — for a transcript reveal —
why. Revealing content is a distinct action from viewing metadata, and is
audited separately.

### `ConfigOverride`

Runtime tunables: quota limits, cost ceilings, feature flags. Loaded at startup
and re-read, so an operator can lower a limit during an incident without a
deploy. Environment variables remain the default; overrides are deliberate,
audited exceptions.

## Indexes

Chosen from the queries that actually run:

- `sessions(ownerUserId, createdAt)` and `sessions(anonymousOwnerHash, createdAt)`
  — the history list, for both account and guest ownership.
- `sessions(status, expiresAt)` — the retention and expiry sweeps.
- `transcript_segments(sessionId, sequence)` unique — ordering _and_ the
  reconnection replay in one index.
- `translations(segmentId, targetLanguage)` unique — the dedup guarantee at the
  storage layer, not just in application code.
- `business_access_codes(codeHash)` unique — code lookup is a single index hit.
- `usage_ledger(userId, periodStart, metric)` — quota checks.
- `users(deletedAt)` — the deletion sweep.

## Migrations

```bash
pnpm db:migrate           # create and apply, development
pnpm db:migrate:deploy    # apply only, production and CI
pnpm db:reset             # drop and rebuild, development only
pnpm db:seed              # demo data
pnpm db:studio            # browse
```

Rules:

- Migrations are committed and are the source of truth. CI asserts the
  migrations reproduce the schema from an empty database, so a schema edited
  without a migration fails the build.
- Additive first. A destructive change is a separate, later migration once no
  deployed code reads the old shape.
- Render runs `prisma migrate deploy` as a **pre-deploy** command, so migrations
  complete before the new instance takes traffic and never run in parallel with
  the old one serving it.
- A migration that would rewrite every row is a red flag: the key-version prefix
  exists precisely so encryption changes never need one.

## Seed

`prisma/seed.ts` creates an admin account, a demo user, a saved personal session
and a live business session — then prints the join code once, to the console,
and never stores it in plaintext. Run it against a development database only.

## Backups

Render's managed Postgres provides automated backups and point-in-time recovery
on paid plans; confirm the retention window matches what the privacy policy
promises. A backup that outlives the stated retention period is a privacy
problem, not just an operational detail — restoring one restores transcripts
that were supposed to be gone.
