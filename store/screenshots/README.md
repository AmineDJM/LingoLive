# Screenshots

Six scenes, captured in every store language. Each one shows the product doing
something real — there are no invented statistics, no fake reviews and no
mocked-up notifications.

## The scenes

| # | Scene | What it must show | Caption theme |
| - | ----- | ----------------- | ------------- |
| 1 | Home | Exactly three actions: Listen, Discuss, Join | "Three things. That's all." |
| 2 | Listen, live | A real transcript with one partial line still forming, source and translation both visible | "Read what is being said, as it is said." |
| 3 | Discuss, 4 people | Four tiles, four different languages, at least one tile rotated 180° | "Everyone speaks their own language." |
| 4 | Discuss, Arabic tile | An Arabic tile rendered right-to-left next to a Latin one | "Arabic that reads correctly." |
| 5 | Join | The 6-digit code entry and the QR scanner | "Join with a code. No account." |
| 6 | Privacy | The settings screen showing "Audio is never recorded" and "Delete my data" | "Nothing is kept unless you ask." |

Scene 4 is not optional. It is the one that shows a reader whose language is
Arabic that this app was built for them and not translated at them.

## Required sizes

**App Store** (portrait, PNG, no transparency, no rounded corners)

| Device            | Pixels        | Required |
| ----------------- | ------------- | -------- |
| 6.9" iPhone       | 1320 × 2868   | Yes      |
| 6.5" iPhone       | 1242 × 2688   | Yes      |
| 13" iPad Pro      | 2064 × 2752   | If `supportsTablet` stays true |

**Google Play**

| Asset             | Pixels        | Required |
| ----------------- | ------------- | -------- |
| Phone screenshot  | 1080 × 1920 (min 320px on the short side) | 2–8 |
| Feature graphic   | 1024 × 500    | Yes      |
| App icon          | 512 × 512     | Yes      |

## Capturing them

`capture.mjs` drives the **web** app in a device-sized browser with mock data,
which is the reproducible way to get identical framing in seven languages.
Store screenshots may be taken from any rendering of the product as long as it
is honest about what the app does.

```bash
# 1. Start the API in mock mode and the web app
AI_PROVIDER=mock ENABLE_DEV_SIMULATOR=true pnpm dev:api
pnpm dev:web

# 2. Capture
node store/screenshots/capture.mjs                    # all locales, all scenes
node store/screenshots/capture.mjs --locale ar        # one locale
node store/screenshots/capture.mjs --scene discuss-4  # one scene
```

Output lands in `store/screenshots/out/<locale>/<size>/<scene>.png`, which is
git-ignored: screenshots are build artefacts, not source.

For the iOS simulator instead:

```bash
pnpm --filter @lingolive/mobile ios
xcrun simctl io booted screenshot scene-1.png
```

## Captions

Add captions as a layer over the screenshot, not inside the app UI. Keep them
under 40 characters so they survive German and Arabic without shrinking to
nothing. Translations live alongside the listing text in
`store/metadata/<locale>/`.
