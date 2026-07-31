<div align="center">

# LingoLive

**Understand every conversation, live.**

Live transcription and translation on iOS, Android and the web.
Three actions: **Listen**, **Discuss**, **Join**. Nothing else on the home screen.

</div>

---

LingoLive turns speech into text and translates it as it is spoken. Put a phone
on the table and everyone reads what is being said in their own language, within
a second.

- **Listen** — someone is speaking and you need to follow.
- **Discuss** — 2 to 4 people around one device, each with their own reading
  language and their own screen orientation.
- **Join** — a 6-digit code, a QR code or a link puts you in a live session.
  No account, no install on the web.

Audio is never recorded. Transcripts are not saved unless you ask. No account is
required to use the product.

## Quick start

```bash
# Node 22.20+, pnpm 10.33+
pnpm install
pnpm bootstrap     # .env, dev secrets, Postgres + Redis, migrations, seed, packages
pnpm dev           # API :4000 · web :3000 · worker
```

Open <http://localhost:3000>. Everything works: `AI_PROVIDER=mock` drives the
whole product from deterministic fixtures, so **no OpenAI account is needed** to
run it, develop against it, or test it.

For the mobile app:

```bash
pnpm dev:mobile    # requires a development build — see docs/DEPLOYMENT.md
```

Full walkthrough, including running without Docker: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## What is in here

```
apps/
  api/          Fastify 5 · REST + WebSocket · Prisma · the only place a provider key exists
  web/          Next.js 16 App Router · marketing, product, PWA, operator console
  mobile/       Expo SDK 57 · Expo Router · iOS and Android
  worker/       retention, expiry, deletion requests, cost roll-up
packages/
  contracts/       Zod schemas shared by API, web and mobile — one definition per shape
  design-tokens/   colours, spacing, motion, contrast assertions
  i18n/            7 interface languages, no hard-coded strings
  realtime-core/   state machine, transcript store, transport interface, layout maths
  api-client/      typed HTTP client
  config/          environment schema with production hardening
  logging/         structured logs that cannot carry transcript content
  observability/   optional analytics and error reporting, off by default
prisma/         schema, migrations, seed
infra/          docker-compose, Render blueprint, k6 load tests, scripts
store/          App Store and Play listings in 7 languages
docs/           architecture, security, privacy, deployment, runbook, ADRs
```

## Commands

| Command               | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `pnpm bootstrap`      | Fresh clone → running product                                   |
| `pnpm dev`            | API, web and worker together                                    |
| `pnpm dev:mobile`     | Expo dev server                                                 |
| `pnpm build`          | Build everything                                                |
| `pnpm test`           | Unit and integration tests                                      |
| `pnpm test:e2e`       | Playwright, against a running app                               |
| `pnpm test:load`      | k6 fan-out scenarios                                            |
| `pnpm check:all`      | format, lint, types, tests, secret scan                         |
| `pnpm check:secrets`  | Scan the tree _and the built bundles_ for credentials           |
| `pnpm check:provider` | Ask your OpenAI account which models exist, and prove one works |
| `pnpm db:migrate`     | Create and apply a migration                                    |
| `pnpm db:studio`      | Browse the database                                             |

## The rules this codebase enforces

These are not conventions. Each one is enforced by a test, a lint rule or a CI
check that fails the build.

**The provider key is server-side. Full stop.**
It is never in the mobile app, the JavaScript bundle, an `EXPO_PUBLIC_*` or
`NEXT_PUBLIC_*` variable, the browser, a log or an analytics event. An ESLint
rule blocks the variable name, `pnpm check:secrets` scans the emitted bundles,
and CI scans the whole git history.

**Audio is never stored.**
There is no audio column, no audio upload, no audio file write. CI greps for
anything that looks like one.

**Logs and analytics cannot carry what people said.**
`@lingolive/logging` scrubs by key and by path; the analytics catalogue is a
closed list of counts, durations and language codes. Tests assert that a real
session's telemetry contains no transcript text and no identifiers.

**Nothing is saved unless the user asks.**
An unsaved session is deleted by the retention job, not archived. Account
deletion is in the app, takes effect, and is tested.

**Seven languages, including Arabic, as a first-class layout.**
No hard-coded strings anywhere. RTL is correct even inside a rotated discussion
tile.

## Documentation

| Document                                         | For                                                    |
| ------------------------------------------------ | ------------------------------------------------------ |
| [PRODUCT](docs/PRODUCT.md)                       | What it is, who it is for, what is deliberately absent |
| [ARCHITECTURE](docs/ARCHITECTURE.md)             | How the pieces fit and why                             |
| [UI_UX](docs/UI_UX.md)                           | Design system, accessibility, RTL, motion              |
| [REALTIME](docs/REALTIME.md)                     | The protocol, reconnection, fan-out                    |
| [API](docs/API.md)                               | Every endpoint                                         |
| [DATABASE](docs/DATABASE.md)                     | Schema, migrations, encryption at rest                 |
| [SECURITY](docs/SECURITY.md)                     | Threat model, tokens, key rotation                     |
| [PRIVACY](docs/PRIVACY.md)                       | What is stored, for how long, and how to delete it     |
| [TESTING](docs/TESTING.md)                       | What is tested and how to run it                       |
| [COST_CONTROLS](docs/COST_CONTROLS.md)           | Quotas, caching, the circuit breaker                   |
| [SEO_ASO](docs/SEO_ASO.md)                       | Localized SEO and store optimisation                   |
| [DEPLOYMENT](docs/DEPLOYMENT.md)                 | Local, Render, EAS                                     |
| [APP_STORE_RELEASE](docs/APP_STORE_RELEASE.md)   | iOS release, step by step                              |
| [PLAY_STORE_RELEASE](docs/PLAY_STORE_RELEASE.md) | Android release, step by step                          |
| [ADMIN](docs/ADMIN.md)                           | The operator console                                   |
| [RUNBOOK](docs/RUNBOOK.md)                       | When something is on fire                              |
| [ADRs](docs/adr/)                                | Decisions, with the reasoning and the alternatives     |

## Honest limits

LingoLive is machine transcription and machine translation. It is fast and it is
useful. It is **not** a certified interpreter, and it should not be the only
thing anyone relies on for a medical, legal or financial decision.

The privacy behaviour described above is what the code does. That is not the
same as a compliance certification: **no claim is made here that LingoLive is
GDPR-, HIPAA- or otherwise compliant**, because compliance is a property of a
deployment, an organisation and an audit — not of a repository. The legal texts
in `docs/legal/` are drafts to be reviewed by a lawyer before publication.

## Licence

UNLICENSED — all rights reserved.
