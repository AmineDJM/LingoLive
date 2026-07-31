# Working in this repository

Guidance for an AI assistant (or a new engineer) making changes here. Read
`README.md` first for what LingoLive is.

## Before you change anything

```bash
pnpm install
pnpm bootstrap        # .env, dev secrets, Postgres + Redis, migrations, seed
pnpm dev              # API :4000 · web :3000 · worker
```

Everything runs with `AI_PROVIDER=mock`. No OpenAI account is needed to develop,
test or demo.

## The rules that are not negotiable

Each is enforced by a test, a lint rule or a CI check. If your change makes one
of these fail, the change is wrong — not the check.

**1. The provider key is server-side only.**
Never in the mobile app, the JS bundle, an `EXPO_PUBLIC_*`/`NEXT_PUBLIC_*`
variable, the browser, a log or an analytics event. Clients get ephemeral,
session-scoped credentials from the API.

**2. Audio is never stored.**
No audio column, no upload endpoint, no file write. CI greps for anything that
looks like one.

**3. Nothing is saved unless the user asks.**
`saveRequested` is the only thing that keeps a personal transcript alive. If you
add a persistence path, it must respect that.

**4. Logs and analytics cannot carry what people said.**
Add a field to a log line and it goes through `scrubForLog`. Add an analytics
event and it must be in the closed catalogue in
`packages/observability/src/events.ts`.

**5. No hard-coded user-facing strings.**
Everything through `@lingolive/i18n`, in all seven locales. A missing key is a
type error.

**6. No flags for languages.**
A flag is a country. Endonyms only.

**7. Three actions on the home screen.**
Listen, Discuss, Join. A fourth is a product decision, not an implementation
detail — open an issue.

## Where things live

| You are changing…                   | Start at                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| A shape shared by client and server | `packages/contracts/src/` — then the type errors will show you everywhere else                              |
| Realtime behaviour                  | `packages/realtime-core/src/` — state machine, transcript store, layout maths. Test it here, not in the UI. |
| A colour, spacing, motion           | `packages/design-tokens/src/index.ts` — never a literal in a component                                      |
| Copy                                | `packages/i18n/src/messages/*.ts` — all seven                                                               |
| An API endpoint                     | `apps/api/src/routes/` + a module in `apps/api/src/modules/`                                                |
| The database                        | `prisma/schema.prisma`, then `pnpm db:migrate`                                                              |
| A marketing page                    | `apps/web/content/` — the test enforces all seven locales and unique metadata                               |
| Web product UI                      | `apps/web/app/[locale]/(app)/` and `apps/web/components/`                                                   |
| Mobile UI                           | `apps/mobile/app/` and `apps/mobile/components/`                                                            |

## Conventions

- **TypeScript strict.** No `any`, no `@ts-ignore`. If the types are fighting
  you, the model is probably wrong.
- **Zod is the source of truth** for every shape that crosses a boundary.
- **Comments explain _why_.** The code already says what. A comment that
  restates the line above it is noise; a comment explaining why the obvious
  approach was rejected is the most valuable thing in the file.
- **Match the surrounding code.** Its comment density and naming are
  deliberate.
- **Errors carry a `requestId`** and never a stack trace, a query or a
  transcript.
- **Logical CSS properties** (`start`/`end`), never `left`/`right` — Arabic is a
  first-class layout.

## Testing

```bash
pnpm test                              # everything
pnpm --filter @lingolive/api test      # one package
pnpm test:e2e                          # Playwright, needs the app running
pnpm check:all                         # what CI runs
```

Test the promise, not the implementation. "An unsaved session is deleted" is a
test; "`purgeUnsavedSessions` calls `deleteMany`" is not.

If your change touches transcripts, tokens or the provider key, add the
assertion that it cannot leak. That is the class of bug this codebase is most
afraid of.

## Commits

Conventional commits: `feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`.

The body should say why, and what a reviewer should look at. If a change was
driven by a bug an end-to-end run found, say so — that is the most useful thing
in the message.

## Things that will bite you

- **Next 16 renamed `middleware.ts` to `proxy.ts`.** Locale routing lives there.
- **Two route groups cannot both own `/[locale]`.** The in-app home is at
  `(app)/app/page.tsx` for this reason.
- **Import specifiers have no `.js` extension in `apps/web`** — Next's bundler
  cannot resolve them. The API, which is plain ESM, does use them.
- **Vitest auto-loads `.env`.** The API harness strips `REDIS_URL` so tests keep
  exercising the single-instance path.
- **Expo SDK 57 removed `edgeToEdgeEnabled`, `newArchEnabled` and top-level
  `splash`** from the config. They are not "optional now"; they are gone.
- **A tile rotated 90° must not move its own box.** Rotate `.ll-tile-content`
  inside a stable container, sized in `cq` units. Rotating the tile itself puts
  it off screen.

## What not to do

- Do not add a dependency without a reason that survives being said out loud.
- Do not add a feature to the main flow that was not asked for.
- Do not invent statistics, testimonials or accuracy claims. Anywhere.
- Do not claim GDPR, HIPAA or any other compliance. Describe what the code does.
- Do not weaken a privacy check to make a test pass.
