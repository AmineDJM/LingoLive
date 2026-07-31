# 10. Total operator observability with an audited transcript gate

**Status:** Accepted · 2026-07-31

## Context

The operator must be able to answer any question about the running system:
who is connected, which sessions are live, what each one costs, which model is
being called, where the latency is, why a request failed, what a user's plan
is, how close they are to their quota. Partial observability means guessing
during an incident.

The same console also sits in front of people's private conversations.

## Decision

**Everything about the system is visible.** Users, devices, sessions,
participants, WebSocket connections, per-room fan-out ratios, usage ledger,
per-model cost attribution, latency percentiles, recent errors, effective
configuration, feature flags, analytics funnels — all exposed under
`/api/v1/admin/*` and rendered in the web operator console. Operators can end
sessions, change plans, suspend accounts, revoke access codes, override
runtime configuration and trip the cost circuit breaker.

**Transcript _content_ is the one gated resource.** Reading the words a user
spoke requires:

- the `admin:transcripts:reveal` permission, separate from `admin:read`;
- a written reason of at least 10 characters, supplied per session;
- an `AdminAuditLog` entry that operators cannot delete or edit.

By default the console shows transcript _metadata_ — sequence, language,
character count, timing, which languages it was translated into — which is
what almost every real support question actually needs.

Defence in depth on the admin surface: a valid admin session **and** the
`X-Admin-Token` shared secret, both required. Network prefixes are truncated
(/24, /48) even for operators.

## Consequences

- An operator can diagnose any incident without shell access to production.
- Every content access is attributable, forever.
- `docs/PRIVACY.md` states plainly that operators can access saved transcript
  content under audit; the product does not claim otherwise.
