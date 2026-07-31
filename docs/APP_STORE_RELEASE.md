# iOS release

Everything from an empty App Store Connect account to a shipped app. The steps
that need a human are marked **[manual]** — they cannot be automated away, and
pretending otherwise wastes a day.

The checklist form of this document is `store/app-store/submission-checklist.md`.

## 0. What you need first

- **[manual]** An Apple Developer Program membership (99 USD/year). Enrolment
  can take days if the account is new or is an organisation.
- A domain you control, serving HTTPS.
- The repository, green: `pnpm check:all`.

## 1. Identifiers

**[manual]** In _Certificates, Identifiers & Profiles_:

1. Register an App ID. `com.lingolive.app` is the default in the code but is
   almost certainly not yours — set `IOS_BUNDLE_IDENTIFIER` to what you
   registered. Nothing in the source assumes a bundle id.
2. Enable **Associated Domains** on that App ID.
3. Note your **Team ID**.

**[manual]** In App Store Connect, create the app record and note the
**ASC App ID**.

## 2. Universal Links

Serve this at `https://<your-domain>/.well-known/apple-app-site-association`,
as `application/json`, with **no redirect**:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["<TEAM_ID>.<BUNDLE_ID>"],
        "components": [{ "/": "/join/*", "comment": "Join a session" }]
      }
    ]
  }
}
```

Verify:

```bash
curl -I https://<your-domain>/.well-known/apple-app-site-association
# 200, content-type: application/json, no 30x
```

A redirect here is the single most common reason links open Safari instead of
the app, and it fails silently.

`app.config.ts` already declares `associatedDomains: ['applinks:<host>']`,
derived from `EXPO_PUBLIC_WEB_URL`.

## 3. EAS

```bash
pnpm --filter @lingolive/mobile exec eas login
pnpm --filter @lingolive/mobile exec eas init
```

Set as GitHub **variables**: `EAS_PROJECT_ID`, `EXPO_OWNER`, `APPLE_TEAM_ID`,
`ASC_APP_ID`.
Set as GitHub **secrets**: `EXPO_TOKEN`, `APPLE_ID`,
`EXPO_APPLE_APP_SPECIFIC_PASSWORD`.

Let EAS manage signing unless you have a reason not to. It handles the
certificate and provisioning profile, which is otherwise the most tedious part
of this process.

## 4. Build

```bash
pnpm mobile:build:production
```

Or the **Release mobile** workflow with `profile: production`. It typechecks,
lints and runs the secret scan first — three minutes that prevent discovering a
type error thirty minutes into a cloud build.

The production profile auto-increments the build number
(`appVersionSource: remote`), so you never think about it. The marketing version
lives in `apps/mobile/app.config.ts`.

## 5. The listing

**[manual]** Upload from `store/metadata/<locale>/` for all seven locales. The
App Store locale codes are in `store/README.md`.

Per locale: name, subtitle, promotional text, description, keywords, what's new.

**[manual]** Screenshots: 6.9" and 6.5" iPhone are required; 13" iPad too while
`supportsTablet` stays true. `store/screenshots/capture.mjs` produces them at
the right sizes in all seven languages.

**[manual]** Support URL, marketing URL, privacy policy URL — all must resolve.

## 6. App privacy

**[manual]** Fill the questionnaire from
`store/app-store/privacy-nutrition-labels.md`. Re-verify each answer against the
deployment you are shipping: the analytics and crash-reporting answers depend on
whether those are configured.

The answers that matter most:

- **Audio data: not collected.** True — audio is streamed and discarded, never
  stored.
- **Tracking: none.** No advertising identifier, no ATT prompt.
- **User ID: collected, linked, not for tracking.** It is an identifier the app
  generates for itself.

## 7. Review information

**[manual]** Paste `store/app-store/review-notes.md` into App Review
Information, with a live 6-digit join code if you have one running.

**[manual]** Fill the contact details, and make sure that mailbox is watched. A
reviewer's question sitting unanswered for four days is four days of delay.

No demo account is needed: the app works immediately as a guest.

## 8. Age rating and export compliance

**[manual]** Age rating: 4+. The app displays user-generated speech as text, so
answer the UGC questions honestly.

**[manual]** Export compliance: `ITSAppUsesNonExemptEncryption` is `false` in
`app.config.ts` and that is accurate — the app uses only the HTTPS/TLS the OS
provides.

## 9. Submit

**[manual]** Select the build, submit for review.

Typical timeline: 24–48 hours for a first review, often faster afterwards. Plan
for a rejection round on a first submission; it is normal, not a failure.

## The rejections to expect

**Guideline 5.1.1 — permission purpose strings.**
The microphone and camera strings in `app.config.ts` are specific and say what is
_not_ done with the audio. If review asks anyway, the full explanation is in the
review notes.

**Guideline 2.1 — incomplete information.**
Usually means the reviewer could not reach a working session. Supply a live join
code and confirm the API is up _before_ submitting.

**Guideline 4.2 — minimum functionality.**
Not expected here — this is a working product with a real backend — but if it
comes up, the answer is the three actions and the live session, demonstrated in
the review notes.

## After approval

- **[manual]** Release manually rather than automatically, so you control the
  moment.
- Watch crash-free sessions for 24 hours.
- Keep the ability to ship a JavaScript fix by OTA
  (`pnpm mobile:update`) — but remember an OTA update must not change what the
  app does in a way review was not aware of.
- A native change means a new binary and a new review. Days, not minutes. Plan
  releases with that in mind.
