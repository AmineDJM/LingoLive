# App Store submission checklist

Everything that cannot be automated. Each item needs a human with access to an
Apple Developer account.

## Once, before the first build

- [ ] Enrol in the Apple Developer Program (99 USD/year) and note the **Team ID**
- [ ] Register the bundle identifier in _Certificates, Identifiers & Profiles_
      (`IOS_BUNDLE_IDENTIFIER`, default `com.lingolive.app` — change it if that
      identifier is not yours)
- [ ] Enable the **Associated Domains** capability for that identifier
- [ ] Create the app record in App Store Connect and note the **ASC App ID**
- [ ] Create an App Store Connect API key for EAS Submit, or be ready to sign in
      interactively
- [ ] Host `.well-known/apple-app-site-association` on the production domain and
      confirm it returns `application/json` with **no** redirect
      (`curl -I https://<domain>/.well-known/apple-app-site-association`)

## Repository variables to fill

| Where                  | Name                                                                  |
| ---------------------- | --------------------------------------------------------------------- |
| GitHub → Variables     | `APPLE_TEAM_ID`, `ASC_APP_ID`, `EAS_PROJECT_ID`, `EXPO_OWNER`         |
| GitHub → Secrets       | `EXPO_TOKEN`, `APPLE_ID`, `EXPO_APPLE_APP_SPECIFIC_PASSWORD`          |
| `.env` / EAS build env | `IOS_BUNDLE_IDENTIFIER`, `EXPO_PUBLIC_WEB_URL`, `EXPO_PUBLIC_API_URL` |

## Every release

### Build

- [ ] `pnpm check:all` is green
- [ ] `pnpm --filter @lingolive/mobile exec expo config --type public` resolves
- [ ] Version bumped in `apps/mobile/app.config.ts`; build number auto-increments
- [ ] `pnpm mobile:build:production` (or run the _Release mobile_ workflow)

### Listing

- [ ] Text uploaded for all seven locales from `store/metadata/`
- [ ] Screenshots uploaded for 6.9" and 6.5" iPhone, and 13" iPad if
      `supportsTablet` stays true — see `store/screenshots/`
- [ ] "What's new" written for this specific version, in all seven locales
- [ ] Support URL and marketing URL reachable
- [ ] Age rating questionnaire completed — LingoLive is 4+; it displays
      user-generated speech, so answer the UGC questions honestly
- [ ] Privacy policy URL points at the live localized page

### Privacy and legal

- [ ] Privacy nutrition labels match `privacy-nutrition-labels.md`, re-verified
      against the current deployment configuration
- [ ] `ITSAppUsesNonExemptEncryption` is `false` and still accurate (it is: the
      app uses only HTTPS/TLS provided by the OS)
- [ ] Export compliance answered
- [ ] Data deletion path confirmed working in the build being submitted:
      Settings → Delete my data

### Review information

- [ ] `review-notes.md` pasted into App Review Information, with a live join
      code if one is available
- [ ] Contact details filled in and the mailbox is monitored
- [ ] Sign-in not required — confirm the reviewer is not blocked by anything

## The two rejections to expect

**Guideline 5.1.1 — purpose strings.** The microphone and camera strings in
`app.config.ts` are specific and say what is _not_ done with the audio. If
review still asks, the answer is in `review-notes.md`.

**Guideline 2.1 — incomplete information.** Usually means the reviewer could not
reach a working session. Supply a live 6-digit join code in the review notes and
confirm the staging or production API is up before submitting.
