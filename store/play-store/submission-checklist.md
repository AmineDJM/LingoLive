# Google Play submission checklist

Everything that needs a human with access to a Play Console account.

## Once, before the first upload

- [ ] Create a Google Play developer account (25 USD, one-off) and complete
      identity verification — this can take days, start early
- [ ] Create the app in Play Console and set the package name
      (`ANDROID_PACKAGE`, default `com.lingolive.app` — change it if that
      package is not yours)
- [ ] Opt into **Play App Signing** (required for new apps)
- [ ] Create a service account with the _Release Manager_ role, download its
      JSON key, and store it as the `PLAY_SERVICE_ACCOUNT_JSON` GitHub secret —
      never in the repository
- [ ] Host `.well-known/assetlinks.json` on the production domain with the
      SHA-256 fingerprint of the **Play App Signing** certificate, not the
      upload certificate — this is the single most common reason App Links
      silently fall back to the browser
- [ ] Verify with
      `https://developers.google.com/digital-asset-links/tools/generator`

## Repository variables to fill

| Where              | Name                                              |
| ------------------ | ------------------------------------------------- |
| GitHub → Variables | `ANDROID_PACKAGE`, `EAS_PROJECT_ID`, `EXPO_OWNER` |
| GitHub → Secrets   | `EXPO_TOKEN`, `PLAY_SERVICE_ACCOUNT_JSON`         |

## Every release

### Build

- [ ] `pnpm check:all` is green
- [ ] Version bumped in `apps/mobile/app.config.ts`
- [ ] `pnpm mobile:build:production` produces an **AAB** (the production profile
      already sets `buildType: app-bundle`)
- [ ] Upload to the **internal testing** track first. Always. `eas.json` submits
      to `internal` with `releaseStatus: draft` by design.

### Listing

- [ ] Title, short description and full description for all seven locales from
      `store/metadata/`
- [ ] Phone screenshots (minimum 2, up to 8) plus a 1024×500 feature graphic
- [ ] App icon 512×512 PNG
- [ ] Category: _Tools_ (or _Productivity_); tags without exaggeration
- [ ] Contact e-mail, and a privacy policy URL that resolves

### Policy forms

- [ ] Data safety form completed from `data-safety.md`
- [ ] Content rating questionnaire — declare that the app displays
      user-generated content
- [ ] Target audience: 13+, and **not** in the Designed for Families programme
- [ ] Ads declaration: no ads
- [ ] Government apps, financial features, health apps: all no
- [ ] Permissions declaration — `RECORD_AUDIO` and `CAMERA` are both used for
      the described core features; no sensitive permission is requested

### Before promoting to production

- [ ] Internal testing installed on a real device, on the target Android version
- [ ] App Link verified: `adb shell am start -a android.intent.action.VIEW -d "https://<domain>/join/728416"`
      opens the app, not the browser
- [ ] Custom scheme verified: `adb shell am start -a android.intent.action.VIEW -d "lingolive://join/728416"`
- [ ] Microphone permission flow tested including a denial
- [ ] Data deletion tested from inside the app
- [ ] Staged rollout: start at 10–20 %, watch crash-free sessions, then widen

## The two rejections to expect

**Permissions.** Play asks why an app needs the microphone. The answer is that
transcription is the app's entire function; the listing and the in-app
explanation both say so before the permission is requested.

**Data safety mismatch.** If the form says audio is not collected while the app
transmits audio, that is a mismatch. Declare audio as _processed ephemerally_,
which is exactly what happens.
