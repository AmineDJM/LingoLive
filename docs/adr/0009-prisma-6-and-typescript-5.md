# 9. Prisma 6.x and TypeScript 5.9 rather than the newest majors

**Status:** Accepted · 2026-07-31

## Context

At implementation time the newest published majors were Prisma 7.x and
TypeScript 7.x. The brief asks for current stable versions *and* for maximum
stability, compatibility and simplicity of deployment. Where those pull apart,
the divergence must be documented.

## Decision

- **Prisma 6.19.3** with the `prisma-client-js` generator, rather than 7.x.
  Prisma 7 moves to driver adapters and ESM-first generated output. That is a
  fine direction, but it adds a driver dependency and module-format
  constraints to a service that also has to run under `tsx` in development and
  compiled CJS on Render. 6.19.x is the last line that needs neither.
- **TypeScript 5.9.3**, rather than 7.x. The `typescript-eslint` toolchain in
  use declares `typescript >=4.8.4 <6.1.0`; Next.js and Expo type plugins
  target the 5.x API. Adopting 7.x today would mean running the type checker
  outside the range its own tooling supports.

Everything else is on the current major: Next.js 16, React 19, Fastify 5,
Expo 57 / React Native 0.86, Zod 4, Vitest 4, Turborepo 2, Tailwind 4.

## Consequences

- Two dependencies are one major behind, deliberately and with a stated reason.
- Upgrade triggers, both mechanical and low-risk:
  - Prisma 7 once the service is on a single module format end to end;
  - TypeScript 7 once `typescript-eslint` and the framework plugins declare support.
- Reviewed at each dependency-audit run (`.github/workflows/security.yml`).
