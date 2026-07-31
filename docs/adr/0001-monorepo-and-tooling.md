# 1. pnpm + Turborepo monorepo

**Status:** Accepted · 2026-07-31

## Context

LingoLive ships four runtimes (iOS, Android, web, API) that must agree
byte-for-byte on the wire format of a transcript segment, the list of supported
languages, the realtime event union and the error codes. A drift between the
mobile client's idea of `transcript.final` and the server's is the kind of bug
that only shows up in production, in a language nobody on the team reads.

## Decision

One repository, pnpm workspaces, Turborepo for task orchestration.

`packages/contracts` is the single source of truth: Zod schemas + types +
pure functions, depended on by every app. Shared packages are built with
`tsup` to dual ESM/CJS with declarations, because the three consumers resolve
modules differently (Next.js prefers ESM, Metro is happiest with CJS, Node
handles both).

`node-linker=hoisted` in `.npmrc` — pnpm's symlinked layout is not reliably
followed by Metro, and this is the setup Expo documents for pnpm monorepos.

## Alternatives considered

- **Separate repositories with a published contracts package.** Correct at
  scale, but every contract change becomes a publish + version-bump + update
  cycle across three repos. Too slow for a product still finding its shape.
- **Nx instead of Turborepo.** More capable, more configuration. Turborepo's
  task graph and caching cover what this project needs.
- **Source-only shared packages (no build step).** Simplest for Next.js,
  fragile for Metro, which does not transpile TypeScript in workspace
  dependencies without extra configuration.

## Consequences

- A contract change is one commit and CI checks every consumer at once.
- `pnpm build` must run before `typecheck` in dependent packages; Turborepo's
  `dependsOn: ["^build"]` encodes that.
- One `pnpm-lock.yaml` pins every version across the whole product.
