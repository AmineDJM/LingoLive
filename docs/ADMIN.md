# The operator console

Everything about the running system, in one place, with nothing hidden — and
with the one genuinely dangerous capability behind a separate, audited gate.

The brief for this surface was that an administrator should be able to answer
any question about the product: any account, any session, any number, any
error, any connection, at any moment. That is what is below.

What it deliberately does **not** do is make conversation content casually
browsable. Total observability of the _system_ is the goal; total exposure of
what people said is not the same thing, and conflating them would make the
console the biggest privacy hole in the product.

## Getting in

Two independent factors, both required, enforced by the API rather than by the
UI:

1. An account with the `ADMIN` role — granted by `ADMIN_EMAILS`.
2. An `X-Admin-Token` header matching `ADMIN_API_TOKEN`.

A stolen admin session is not enough. A leaked shared secret is not enough. If
`ADMIN_API_TOKEN` is unset in staging or production, the whole surface refuses
to serve rather than silently degrading to one factor.

The console is at `/<locale>/admin`, is `noindex`, and is excluded in
`robots.txt`.

## Overview

The answer to "is it healthy right now":

- Live sessions, by kind, right now
- Connected participants and open WebSocket connections
- Users: total, guests, accounts, new today
- Minutes consumed today and this month
- Cost today and this month, and the distance to each limit
- Circuit-breaker state
- Provider mode (`mock` / `openai`) and the configured models
- Errors in the last hour, by code
- API uptime and version
- Redis and database status

## Sessions

Every session, filterable by kind, status, owner, language and date.

Per session: kind, owner (account or guest), status, start and end, duration,
segment count, reading languages, participant count, slot configuration and
rotations, whether it was saved, usage and derived cost.

**Content is not shown.** The list and detail views carry metadata only.

### Revealing content

`POST /admin/sessions/:id/reveal` decrypts and returns the transcript. It:

- is a **separate action** from viewing the session,
- **requires a reason** in the request body,
- is written to the audit log with the actor, the session, the reason and the
  timestamp,
- appears in the audit view as its own action type.

This exists because support and abuse investigation are real, and pretending
otherwise leads to people running raw SQL instead — which leaves no trace at
all. Making it possible, deliberate and permanently recorded is the honest
design.

Also available: force-end a running session, delete a session and everything
under it.

## Users

Every account and guest. Per user: plan and entitlements with their source and
expiry, devices (platform, app version, locale, last seen — identified by hash,
never by a raw device id), sessions, usage by period, analytics events, deletion
request state.

Actions: change plan, grant or revoke an entitlement, suspend, delete the account
and everything under it. All audited.

E-mail addresses are masked in list views and revealed in the detail view, where
looking at one is a deliberate act.

## Usage and cost

Audio seconds and translation characters by day, month, plan and metric; derived
cost with the rates in force; top consumers; the cost trend against the daily
and monthly limits.

Every figure comes from the usage ledger, which is server-measured. Nothing here
is an estimate.

## Realtime

The live view: every open connection and every room, right now.

Per room: session id, kind, participant count, the distinct reading languages
currently subscribed, message throughput. Per connection: role, reading
language, connected-at, last heartbeat.

This is where the fan-out property is visible in production — a room with 500
participants and 3 distinct languages should be doing 3 translations per turn,
and if it is not, something is wrong.

## Performance

Latency percentiles (p50/p95/p99) by route, throughput, error rate, slowest
routes, WebSocket connect and message latency, provider call latency and failure
rate.

Measured in-process by `MetricsRegistry` on every request, so these are real
percentiles and not a sampled approximation.

## Configuration

Every runtime tunable — quota limits, cost ceilings, session limits, feature
flags — with its current value, its default, and whether it is overridden.

Changing one writes a `ConfigOverride` row that takes effect without a deploy.
Lowering a limit during an incident does not require a release.

Secrets are **never** shown. `redactedConfig()` filters them out on the server
side; there is no code path that returns a secret to this view.

## Audit log

Every administrative action, in one place: who, when, what, against which
entity, and the reason where one was required.

Filterable by actor, action type, entity and date range. Append-only.

Recorded actions include: transcript reveal, user plan change, entitlement grant
or revoke, account suspension, account deletion, session force-end, session
deletion, access-code revocation, configuration change.

## Business access codes

Live and expired codes, with their session, creation time, expiry, use count and
status. A code can be revoked immediately — the one thing you need when a code
has been shared somewhere it should not have been.

Codes are stored hashed; the console shows their status and their session, not
the code itself.

## What the console cannot do

- It cannot show audio. There is none.
- It cannot show transcript content without leaving an audit record.
- It cannot show a secret.
- It cannot resurrect a deleted session. Deletion is real.

## Operating it safely

- `ADMIN_EMAILS` should be short. Every name on it is a person who can read a
  transcript with a reason.
- Rotate `ADMIN_API_TOKEN` on any staff change.
- Read the audit log on a schedule, not only after an incident.
- If you find yourself revealing transcripts routinely, that is a product
  problem — the tooling around it needs fixing, not more reveals.
