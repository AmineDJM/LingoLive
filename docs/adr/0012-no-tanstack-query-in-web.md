# 12. No TanStack Query in the web app

**Status:** Accepted · 2026-07-31

## Context

TanStack Query is on the requested stack, and it is the right default for a
React app with a lot of server state: caching, deduplication, background
refetching, stale-while-revalidate, retries.

LingoLive's web app turned out not to be that app.

The product's data does not arrive by fetching. It arrives over a WebSocket,
pushed, and is held in `TranscriptStore` from `@lingolive/realtime-core` —
ordered by sequence, deduplicated, and replayed from the last seen sequence on
reconnect. That is a cache with an invalidation strategy; it is just not an HTTP
one.

What remains is a handful of one-shot requests: register a guest, create a
session, mint a realtime token, end a session, list saved sessions. Most of them
are mutations. The reads happen once per navigation, and two of them are server
components that use `use()` and Next's own request memoisation.

## Decision

The web app does not use TanStack Query. HTTP calls go through
`@lingolive/api-client`, and the one client-side hook that needs them
(`use-live-session.ts`) owns its own state.

The specification asked for it to be documented if any part of the stack was
diverged from. This is that documentation.

## Alternatives considered

**Use it anyway, for consistency with the requested stack.** Rejected: adding a
provider, a query client and a cache configuration to manage five requests — four
of which are mutations — is more moving parts, not fewer, and every one of them
is a thing that can be misconfigured. Consistency with a stack list is not a
user-visible property.

**Use it as the transport for the realtime data too.** Rejected as a category
error. Query is built around "ask the server for the current value"; this data
is "the server tells you what changed, in order, and you must not lose your
place". Modelling a sequenced push stream as a query would mean fighting the
library on its core assumption.

**Use SWR or a smaller cache library instead.** Same objection, smaller
footprint. Still solves a problem the app does not have.

## Consequences

**Good**

- One less client dependency in the bundle, on a marketing site that is measured
  on Core Web Vitals.
- The realtime state has exactly one owner. There is no second cache that can
  disagree with `TranscriptStore` about what the transcript says — which would be
  a genuinely nasty class of bug.
- Reasoning about the data flow means reading one hook.

**Bad**

- Anything genuinely list-and-detail added later — an organizer dashboard,
  admin surfaces that grow beyond the current console — will want caching, and
  will have to introduce it then rather than finding it already there.
- No free retry/backoff on the HTTP calls; `api-client` handles token refresh
  and error mapping, and nothing else.

**Revisit when** the web app grows a surface with more than a handful of
independent server-state reads. The LingoBusiness organizer dashboard, when it
is built, is very likely that surface — and at that point TanStack Query is the
right answer.
