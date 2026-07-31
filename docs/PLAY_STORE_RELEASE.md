# Android release

Everything from an empty Play Console account to a shipped app. **[manual]**
marks a step that needs a human.

The checklist form of this document is
`store/play-store/submission-checklist.md`.

## 0. What you need first

- **[manual]** A Google Play developer account (25 USD, one-off). **Identity
  verification can take several days** — start it before you need it.
- A domain you control, serving HTTPS.
- The repository, green: `pnpm check:all`.

## 1. Create the app

**[manual]** Play Console → _Create app_. Set the package name; `com.lingolive.app`
is the default in the code and is almost certainly not yours — set
`ANDROID_PACKAGE` to what you registered.

**[manual]** Opt into **Play App Signing**. It is required for new apps, and it
determines which certificate fingerprint your App Links must use — see below.

## 2. App Links

Serve this at `https://<your-domain>/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "<ANDROID_PACKAGE>",
      "sha256_cert_fingerprints": [
        "<SHA-256 of the PLAY APP SIGNING certificate>"
      ]
    }
  }
]
```

**The fingerprint must be the Play App Signing certificate, not the upload
certificate.** Using the upload certificate is the most common mistake here, and
the failure is silent: links quietly open the browser instead of the app.

Find it in Play Console → _Setup_ → _App signing_.

Verify with the [statement list tester](https://developers.google.com/digital-asset-links/tools/generator),
then on a device:

```bash
adb shell am start -a android.intent.action.VIEW -d "https://<domain>/join/728416"
adb shell am start -a android.intent.action.VIEW -d "lingolive://join/728416"
```

`app.config.ts` already declares the intent filter with `autoVerify: true`.

## 3. Service account for automated submission

**[manual]** Google Cloud Console → create a service account → grant it the
_Release Manager_ role in Play Console → download the JSON key.

Store it as the `PLAY_SERVICE_ACCOUNT_JSON` GitHub secret. **Never in the
repository** — the secret scanner fails the build if a
`google-play-service-account.json` is ever tracked.

The release workflow writes it to `$RUNNER_TEMP` at submission time and removes
it afterwards.

## 4. Build

```bash
pnpm mobile:build:production
```

The production profile emits an **AAB** (`buildType: app-bundle`), which is what
Play requires. `autoIncrement` handles the version code.

Or run the **Release mobile** workflow, which runs the typecheck, the lint and
the secret scan before spending 30 minutes on a cloud build.

## 5. Internal testing first. Always.

`eas.json` submits to the `internal` track with `releaseStatus: draft` by design.

```bash
pnpm mobile:submit:android
```

**[manual]** Install from the internal track on a real device — not only an
emulator — and verify:

- microphone permission flow, including a denial
- camera permission and QR scanning
- both deep-link forms above
- the app in Arabic, with the system language set to Arabic
- data deletion from inside the app

## 6. The listing

**[manual]** Upload from `store/metadata/<locale>/` for all seven locales. The
Play locale codes are in `store/README.md`.

Per locale: title (30), short description (80), full description (4 000),
what's new.

**[manual]** Graphics: phone screenshots (2–8), a 1024 × 500 feature graphic, a
512 × 512 icon. `store/screenshots/capture.mjs` produces the screenshots.

## 7. Policy forms

**[manual]** **Data safety** — fill from `store/play-store/data-safety.md`.

The answer that needs care: audio. Play defines "collected" as transmitted off
the device, and LingoLive does transmit audio for transcription. Declare it as
**processed ephemerally** — that option exists precisely for this, and it is the
honest answer. Claiming audio is not collected at all would be a mismatch, and a
data safety mismatch is grounds for removal.

**[manual]** **Content rating** — complete the questionnaire; declare that the
app displays user-generated content.

**[manual]** **Target audience** — 13+. Do **not** opt into Designed for
Families.

**[manual]** **Ads** — none.

**[manual]** **Permissions declaration** — `RECORD_AUDIO` and `CAMERA`, both used
for the described core features. No sensitive permission is requested; external
storage, location and contacts are explicitly blocked in the manifest.

## 8. Production rollout

**[manual]** Promote internal → production with a **staged rollout**: start at
10–20 %.

Watch for 24–48 hours:

- crash-free session rate
- ANR rate
- installs and uninstalls
- reviews mentioning something specific

Then widen. A staged rollout can be halted; a full release cannot be un-shipped.

## The rejections to expect

**Permissions.**
Play asks why the app needs the microphone. Transcription is the entire function;
the listing says so, and the app explains it before requesting the permission.

**Data safety mismatch.**
See section 7. Declare audio as processed ephemerally.

**Broken functionality.**
Usually means the reviewer's device could not reach a working session. Confirm
production is up before promoting.

## After release

- An OTA JavaScript fix ships in minutes (`pnpm mobile:update`), gated on a
  matching native fingerprint.
- A native change needs a new AAB and a new review.
- Play's staged rollout is the safety net a store review is not — use it every
  time, not only for risky releases.
