# Deployment

Three parts: run it locally, deploy the server on Render, ship the apps with
EAS.

---

## 1. Local

### Requirements

- Node **22.20.0** (`.nvmrc`) — `nvm use`
- pnpm **10.33.0** — `corepack enable`
- Docker (optional; without it, bring your own Postgres and Redis)

### One command

```bash
pnpm install
pnpm bootstrap
```

`bootstrap` copies `.env.example` to `.env` (never overwriting an existing one),
replaces the placeholder secrets with real generated values, starts Postgres and
Redis if Docker is available, applies migrations, seeds demo data and builds the
shared packages. It prints what it did and what it skipped.

### Run

```bash
pnpm dev              # API :4000 · web :3000 · worker
```

- Web app — <http://localhost:3000>
- API health — <http://localhost:4000/health>
- Operator console — <http://localhost:3000/en/admin>

Individually: `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:worker`.

**No OpenAI account is needed.** `AI_PROVIDER=mock` drives the whole product
from deterministic fixtures. This is the default and it is what CI runs.

### Without Docker

Start PostgreSQL 16 and Redis yourself, or point at existing instances:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/lingolive?schema=public
REDIS_URL=                       # may be left empty
```

With `REDIS_URL` empty the API runs single-instance: in-memory rate limits, an
in-memory replay guard, no cross-instance fan-out. It logs this at startup. It is
a supported way to run a small deployment.

### Mobile

Expo Go will not work: the audio and camera modules need native code. Build a
development client once, then iterate over the air.

```bash
pnpm --filter @lingolive/mobile exec eas build --profile development --platform ios
# or --platform android
pnpm dev:mobile
```

On a simulator or emulator, point the app at your machine:

```bash
EXPO_PUBLIC_API_URL=http://localhost:4000 pnpm dev:mobile
# On a physical device use your LAN address, e.g. http://192.168.1.20:4000
```

### Trying a real business session

```bash
# 1. Create a room (dev simulator; requires ENABLE_DEV_SIMULATOR=true)
curl -XPOST http://localhost:4000/api/v1/dev/business/sessions \
  -H 'content-type: application/json' \
  -d '{"title":"Demo","sourceLanguage":"fr","targetLanguages":["en","ar","pt-BR"]}'
# → { "code": "728416", "joinUrl": "...", "deepLink": "lingolive://join/728416", ... }

# 2. Join at http://localhost:3000/en/join/728416 in two browsers, different languages

# 3. Make the organizer speak
curl -XPOST http://localhost:4000/api/v1/dev/business/speak \
  -H 'content-type: application/json' \
  -d '{"sessionId":"<id>","language":"fr","count":5}'
```

### Checks

```bash
pnpm check:all        # format, lint, types, tests, secret scan
pnpm test:e2e         # Playwright, against a running app
pnpm test:load        # k6 (install k6 separately)
```

---

## 2. Render

`infra/render.yaml` is a Blueprint describing staging and production side by
side: an API, a web app, a worker, Postgres and Redis for each.

### First deploy

1. **Create the Blueprint.** Render dashboard → _Blueprints_ → _New Blueprint
   Instance_ → point at this repository → set **Blueprint Path** to
   `infra/render.yaml` and **Branch** to the branch you are deploying. Review
   the resources it will create; the free tiers are not appropriate for the
   realtime path (they sleep).

   No service in the Blueprint pins a branch name. Every service follows the
   branch you select here, so the file validates on any repository whatever its
   default branch is called. Staging and production are separated by
   `autoDeploy`, not by branch: staging redeploys on every push to that branch,
   production only when someone asks it to.

2. **Fill the secrets.** Every `sync: false` variable must be set in the
   dashboard before the first deploy. The API refuses to boot in staging or
   production with a placeholder value.

   ```bash
   node infra/scripts/generate-secrets.mjs
   ```

   | Variable                                         | Notes                                                                |
   | ------------------------------------------------ | -------------------------------------------------------------------- |
   | `TRANSCRIPT_ENCRYPTION_KEY`                      | 32 raw bytes, base64. Losing it means losing every saved transcript. |
   | `OPENAI_API_KEY`                                 | **API service only.** Never on the web service.                      |
   | `OPENAI_TRANSLATION_MODEL`                       | No default on purpose — set what is current for your account.        |
   | `ADMIN_EMAILS`                                   | Comma-separated; these accounts get the admin role.                  |
   | `DAILY_COST_LIMIT_USD`, `MONTHLY_COST_LIMIT_USD` | Production values come from a real budget.                           |

   `SESSION_SIGNING_SECRET`, `AUTH_SECRET` and `ADMIN_API_TOKEN` use
   `generateValue: true` — Render generates them and you never see a placeholder.

3. **Deploy the API first**, then the worker, then the web app. Migrations run
   as the API's `preDeployCommand`, so they complete before the new instance
   takes traffic.

4. **Point the URLs at each other.** Staging wires itself with `fromService`.
   Production leaves the URL variables as `sync: false` so you can set the real
   custom domains once they are verified.

5. **Verify.**

   ```bash
   curl https://<api-host>/health          # {"status":"ok",...}
   curl https://<api-host>/ready           # per-dependency detail
   curl https://<web-host>/robots.txt      # staging must Disallow: /
   ```

### Automatic deploys

- **Staging** deploys on every green CI run on `main`, then smoke-tests itself:
  health, readiness, the public config (asserting it advertises no secret), all
  seven locales, robots, and a full guest session lifecycle. Configure the three
  `RENDER_DEPLOY_HOOK_*_STAGING` secrets and the `STAGING_API_URL` /
  `STAGING_WEB_URL` variables.
- **Production** never deploys on push (`autoDeploy: false`). A release is a
  deliberate act — see below.

### Scaling

`numInstances` is safe to raise: Redis pub/sub makes API instances
interchangeable. The bottleneck order, from the load tests, is documented in
`docs/COST_CONTROLS.md#scaling`.

### Custom domains

Add the domain in Render, add the DNS records it shows, wait for the
certificate. Then update `APP_BASE_URL`, `WEB_BASE_URL`, `API_BASE_URL`,
`CORS_ALLOWED_ORIGINS`, `NEXT_PUBLIC_*` and `EXPO_PUBLIC_WEB_URL`, and publish
`.well-known/apple-app-site-association` and `.well-known/assetlinks.json` on
it — see the two store release documents.

---

## 3. EAS (mobile)

### Setup, once

```bash
pnpm --filter @lingolive/mobile exec eas login
pnpm --filter @lingolive/mobile exec eas init      # creates the project, prints EAS_PROJECT_ID
```

Set `EAS_PROJECT_ID`, `EXPO_OWNER`, `IOS_BUNDLE_IDENTIFIER` and
`ANDROID_PACKAGE`. Nothing in the source assumes a bundle id or a domain that is
not yours.

### Profiles

| Profile       | Distribution | Channel       | For                                              |
| ------------- | ------------ | ------------- | ------------------------------------------------ |
| `development` | internal     | `development` | Dev client, simulator build, points at localhost |
| `preview`     | internal     | `preview`     | Internal testers, points at staging              |
| `production`  | store        | `production`  | App Store / Play, auto-incrementing build number |

### Build and submit

```bash
pnpm mobile:build:preview            # both platforms
pnpm mobile:build:production
pnpm mobile:submit:ios
pnpm mobile:submit:android
```

Or run the **Release mobile** workflow, which typechecks, lints and runs the
secret scan before spending 30 minutes on a cloud build, and gates submission
behind a protected environment.

### Over-the-air updates

```bash
pnpm mobile:update                   # or the EAS update workflow
```

`runtimeVersion: { policy: 'fingerprint' }` means a JS bundle is only delivered
to binaries whose native fingerprint matches. A bundle expecting native code the
installed app lacks is never shipped.

An OTA update may carry fixes, copy and layout. It must not change what the app
does in a way store review was not aware of.

---

## Environment variables

`.env.example` documents every variable with a `[required]`, `[required:prod]`,
`[optional]` or `[public]` marker. `[public]` means the value **is** shipped to
clients — a secret there is a secret published.

The ones that must be filled for a real deployment:

| Variable                                                                    | Where                                  |
| --------------------------------------------------------------------------- | -------------------------------------- |
| `DATABASE_URL`                                                              | API, worker                            |
| `REDIS_URL`                                                                 | API, worker (optional but recommended) |
| `SESSION_SIGNING_SECRET`, `AUTH_SECRET`                                     | API                                    |
| `TRANSCRIPT_ENCRYPTION_KEY` (+ `_VERSION`)                                  | API, worker                            |
| `ADMIN_API_TOKEN`, `ADMIN_EMAILS`                                           | API                                    |
| `OPENAI_API_KEY`, `OPENAI_TRANSLATION_MODEL`                                | **API only**                           |
| `APP_BASE_URL`, `WEB_BASE_URL`, `API_BASE_URL`, `CORS_ALLOWED_ORIGINS`      | API                                    |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ALLOW_INDEXING` | Web                                    |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL`                                | Mobile                                 |
| `EAS_PROJECT_ID`, `EXPO_OWNER`, `IOS_BUNDLE_IDENTIFIER`, `ANDROID_PACKAGE`  | Mobile builds                          |

Optional and inert when empty: `SENTRY_DSN`, `POSTHOG_KEY`, every billing
variable.

---

## Production release

```bash
# 1. Everything is green
pnpm check:all
pnpm test:e2e

# 2. Tag
git tag -a v1.0.0 -m "LingoLive 1.0.0"
git push origin v1.0.0

# 3. Server — Render dashboard, production services, "Manual Deploy"
#    Order: API (migrations run first), then worker, then web.

# 4. Verify
curl https://<api-host>/health
curl https://<api-host>/ready

# 5. Mobile — Release mobile workflow, profile: production, submit: true
```

Rolling back the server is Render's "Rollback" on the previous deploy. Rolling
back a mobile release is not instant: an OTA update can revert JavaScript
immediately, but a native change needs a new binary through review. Plan
accordingly.
