# Security

## The one absolute rule

**The OpenAI API key exists on the server and nowhere else.**

Not in the mobile app. Not in the JavaScript bundle. Not in an `EXPO_PUBLIC_*`
or `NEXT_PUBLIC_*` variable. Not in the browser. Not in a committed file. Not in
a log. Not in an analytics event.

This is enforced in four independent places, because a rule with one enforcement
point is a rule that will eventually be broken:

1. **Edit time** — an ESLint `no-restricted-syntax` rule rejects any identifier
   matching `EXPO_PUBLIC_OPENAI*` or `NEXT_PUBLIC_OPENAI*`.
2. **Commit time** — `pnpm check:secrets` scans every tracked file for provider
   key patterns, public env names that mention a provider, and imports of the
   OpenAI SDK from client trees.
3. **Build time** — the same scanner reads the _emitted_ `.next/static` and Expo
   bundles. This is the only check that proves what actually ships.
4. **CI** — `security.yml` re-runs the scanner against the full git history, so
   a key that was committed and later removed is still caught.

Clients never hold provider credentials. They ask the API for an ephemeral
credential scoped to one session, with a TTL measured in seconds
(`REALTIME_TOKEN_TTL_SECONDS`, default 60), and the API mints it only after
authenticating the caller and checking their quota.

## Threat model

What this system is actually protecting, and from whom.

| Asset                | Threat                          | Mitigation                                                                                                          |
| -------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Conversation content | Interception in transit         | TLS everywhere; WebSocket over TLS; HSTS with preload in staging/production                                         |
| Conversation content | Database compromise             | AES-256-GCM application-layer encryption before storage; the DB never sees plaintext                                |
| Conversation content | Leaking into logs               | `@lingolive/logging` scrubs by key _and_ path; Prisma query logging is off because it echoes parameters             |
| Conversation content | Leaking into analytics          | Closed event catalogue; strings only on enum properties; asserted by tests                                          |
| Conversation content | Browser cache                   | Service worker structurally refuses API, authorized and product-surface responses; every API response is `no-store` |
| Provider key         | Exposure to clients             | Above                                                                                                               |
| Provider key         | Cost abuse                      | Server-measured usage ledger, per-role quotas, daily and monthly cost circuit breaker                               |
| A private session    | Someone guessing a 6-digit code | Failed-attempt throttling with escalating block; codes are stored hashed and expire                                 |
| An account           | Token theft                     | Purpose-scoped, short-lived, single-use where it matters; replay guard                                              |
| The operator console | A stolen admin session          | Admin role **and** a separate shared secret header; every sensitive action audited                                  |
| The API              | Volumetric abuse                | Rate limits keyed by identity first, IP second; body size caps; request timeouts                                    |

## Tokens

Every token is an HMAC-SHA256-signed payload with a `typ` claim naming its
purpose:

| `typ`           | Purpose                                  | TTL                                | Notes                                |
| --------------- | ---------------------------------------- | ---------------------------------- | ------------------------------------ |
| `access`        | Authenticated API calls                  | `ACCESS_TOKEN_TTL_SECONDS` (1 h)   | Guest or account                     |
| `refresh`       | Obtaining a new access token             | `REFRESH_TOKEN_TTL_SECONDS` (30 d) |                                      |
| `realtime`      | One WebSocket connection to one session  | Seconds                            | Single use — a replay guard burns it |
| `business_join` | Joining one business session as a viewer | Session lifetime                   |                                      |
| `organizer`     | Organizer-side operations on one session | Session lifetime                   | Used by the dev simulator            |

A token minted for one purpose is rejected for another. The replay guard is a
Redis `SET NX` when Redis is available and an in-memory set when it is not, so
single-use is enforced in both deployment shapes.

Signature comparison is constant-time. So is the admin shared-secret comparison.

## Encryption at rest

Transcript and translation text is encrypted before it reaches Postgres:

```
v1.<iv-base64>.<authTag-base64>.<ciphertext-base64>
 │
 └── key version — this is what makes rotation possible
```

AES-256-GCM. The key comes from `TRANSCRIPT_ENCRYPTION_KEY` (32 raw bytes,
base64-encoded) and its version from `TRANSCRIPT_ENCRYPTION_KEY_VERSION`.

### Key rotation

The version prefix means old and new ciphertext can coexist:

1. Generate a new key: `node infra/scripts/generate-secrets.mjs`.
2. Deploy with the new key as `TRANSCRIPT_ENCRYPTION_KEY` and the version
   incremented, keeping the previous key available for decryption.
3. New writes use v2. Reads of v1 rows still work.
4. Re-encrypt at leisure, or simply let retention expire the v1 rows — for
   personal sessions that is at most an hour, for business sessions seven days.
5. Once no v1 ciphertext remains, retire the old key.

There is no window in which the product is down, and no migration that has to
rewrite every row atomically.

## The access-code guard

A conference hall is one NAT address. A flat "30 joins per minute per IP" limit
would let the first thirty attendees in and lock out the rest — a correct-looking
rate limit that breaks the product exactly when it is being used as intended.

So the guard throttles **failures**, not joins:

- 600 joins/minute per IP: high enough for a hall.
- 60 previews/minute per IP.
- 10 _failed_ code attempts per minute → a 5-minute block.

Guessing a 6-digit code at 10 attempts per minute with a 5-minute penalty is not
a viable attack. Attending a conference is unaffected.

Codes themselves are stored hashed, are single-purpose, and expire
(`BUSINESS_CODE_TTL_HOURS`, default 24).

## HTTP hardening

- `helmet` with a restrictive CSP — the API serves JSON, so `default-src 'none'`
  costs nothing.
- HSTS with `includeSubDomains` and `preload` in staging and production.
- CORS from an explicit allow-list; wildcard is rejected outside development.
- `cache-control: no-store` and `x-content-type-options: nosniff` on every
  response.
- 256 KB body limit, 30 s request timeout.
- `trustProxy` on, because the deployment sits behind one.

## Admin access

Two independent factors:

1. The account must have the `ADMIN` role (granted by `ADMIN_EMAILS`).
2. Every `/api/v1/admin/*` request must carry `X-Admin-Token` matching
   `ADMIN_API_TOKEN`.

A stolen admin session is not enough; a stolen shared secret is not enough. If
`ADMIN_API_TOKEN` is unset in staging or production the entire admin surface
refuses to serve rather than falling back to a single factor.

Revealing a transcript from the console is a distinct, audited action. See
`docs/ADMIN.md`.

## Secrets in the repository

None. `.env` is git-ignored, `.env.example` contains only placeholders, and the
scanner fails the build if a `.env`, a Play service-account key or a signing
credential is ever tracked.

Generate real values with:

```bash
node infra/scripts/generate-secrets.mjs
```

Rotate `SESSION_SIGNING_SECRET`, `AUTH_SECRET`, `ADMIN_API_TOKEN` and
`TRANSCRIPT_ENCRYPTION_KEY` on any suspicion of exposure. The first three take
effect immediately (existing tokens become invalid, users re-register silently);
the fourth follows the rotation procedure above.

## Reporting a vulnerability

Open a private security advisory on the repository. Never a public issue, and
never with transcript content, tokens or keys in the body.

## What is _not_ claimed

LingoLive is **not** claimed to be GDPR-compliant, HIPAA-compliant, or compliant
with any other regime. Compliance is a property of a deployment, an
organisation, a set of contracts and an audit — not of a repository. What is
documented here is what the code does. Whether that is sufficient for a given
regulatory context is a question for a lawyer and an auditor, and the legal
texts in `docs/legal/` are drafts pending exactly that review.
