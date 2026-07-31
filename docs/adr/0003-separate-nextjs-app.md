# 3. A separate Next.js app for SEO and the web product

**Status:** Accepted · 2026-07-31

## Context

LingoLive needs two very different things from the web:

1. Marketing pages that rank — seven locales, static rendering, Core Web
   Vitals under threshold, structured data, sitemaps.
2. A real web application — microphone capture, WebSocket transcript, the
   Discuss canvas, and the no-install path for LingoBusiness participants.

## Decision

One Next.js 16 App Router application serving both, with a hard separation:

- `app/[locale]/(marketing)/*` — static, no audio engine in the bundle, fully
  indexable, `hreflang` + `x-default` + canonicals.
- `app/[locale]/(app)/*` — client-side product surfaces, `noindex`.

React Native Web was rejected: sharing components across mobile and web would
have compromised both the SEO bundle size and the ability to use platform-idiomatic
patterns. What *is* shared is everything that matters for correctness —
contracts, realtime logic, i18n, design tokens.

## Alternatives considered

- **Expo Router web export.** One codebase, but a client-rendered bundle that
  loads the audio engine on the marketing home page. Unacceptable for LCP and
  for indexing.
- **A separate static site generator for marketing.** Two deployments, two
  design systems, duplicated i18n.

## Consequences

- Marketing and product screens are written twice at the presentation layer,
  once at the logic layer.
- The marketing home page never imports `@lingolive/realtime-core`; a CI bundle
  check keeps it that way.
- Locales live in the URL (`/fr`, `/pt-br`, …), never negotiated on one URL.
