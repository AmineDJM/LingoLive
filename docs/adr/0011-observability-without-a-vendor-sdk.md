# 11. Optional observability without a vendor SDK

**Status:** Accepted · 2026-07-31

## Context

The specification asks for Sentry and PostHog as optional integrations. Both are
genuinely useful: a crash you cannot see is a crash you cannot fix, and knowing
which of the three actions people actually use is worth knowing.

But this is a product whose entire proposition is that what people say does not
leak. The two categories of tool most likely to leak it are exactly these:

- An error reporter attaches request bodies, headers, breadcrumbs and local
  variables by default. A breadcrumb containing a transcript is one
  `console.log` away.
- An analytics client accepts arbitrary event names with arbitrary properties.
  Nobody adds `{ text }` maliciously — they add it while debugging, and it ships.

A vendor SDK also installs global handlers and instrumentation whose exact
behaviour changes between minor versions. "We turned off the option that sends
request bodies" is a claim with a shelf life.

## Decision

Both integrations live in `@lingolive/observability`, are **off by default**, and
do not use a vendor SDK.

**Analytics** is a closed catalogue. `events.ts` lists every event LingoLive may
emit, with its declared properties. At runtime:

- an event name not in the catalogue is rejected;
- a property not declared for that event is dropped;
- a **string** value on a property that is not an enum property is dropped.

The third rule is the one that matters: it means even a declared property cannot
be repurposed to carry a sentence. A test asserts the catalogue contains no
property whose name suggests free text, and fails if one is added.

The subject identifier is a truncated one-way derivation of the actor, so the
analytics store cannot join back to a LingoLive account.

**Error reporting** speaks Sentry's documented envelope protocol directly, in
about 150 lines. What is sent is built by one exported function, `buildEvent`,
which produces: the exception type, a scrubbed message, and a handful of enum
tags. No request body. No headers. No query string. No user identity. Because
`buildEvent` is a pure function, a unit test asserts the exact payload — which is
not possible with an SDK that assembles the event across a dozen internal hooks.

Both are inert when unconfigured: `createAnalytics({ enabled: false })` and
`createErrorReporter({})` return frozen no-op objects that allocate nothing.

## Alternatives considered

**`@sentry/node` + `posthog-node` with careful configuration.** The obvious
choice, and it was rejected on one question: what exactly leaves the process on
the day someone upgrades a minor version? With an SDK, answering that means
reading the SDK. Here it means reading one function that a test already pins.

**No integrations at all.** Tempting, and it is the default. But an operator
running this in production deserves to see crashes, and forcing them to bolt on
an SDK themselves guarantees a worse outcome than giving them a safe one.

**A generic OpenTelemetry exporter.** More moving parts than the problem needs,
and it does not solve the content-leakage question — it relocates it.

## Consequences

**Good**

- With `SENTRY_DSN` empty and `ANALYTICS_ENABLED=false` — the defaults — the
  product makes no third-party network call at all.
- What leaves the process is pinned by a test, not by configuration.
- No vendor dependency in the mobile bundle, which is also a size and a startup
  cost.
- An operator can swap in a different backend by changing one transport.

**Bad**

- No automatic instrumentation: no performance traces, no session replay, no
  breadcrumbs. Errors are reported where the code reports them.
- No source-map upload pipeline, so a stack trace is not symbolicated. The
  exception type, route and request id have been enough so far, and the request
  id points at the full server-side log line.
- If a project later wants Sentry's tracing, this becomes a rewrite of one file
  rather than an addition — a real cost, accepted deliberately.

**Revisit if** performance tracing across the realtime path becomes necessary,
or if the team is large enough that "errors are reported where the code reports
them" stops being sufficient.
