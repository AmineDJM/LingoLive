# Design and accessibility

## The constraint that shapes everything

The person using LingoLive is often stressed, sometimes holding something in one
hand, frequently on a borrowed or low-end phone, and usually in a room with
background noise. They did not choose to need this app.

Everything below follows from that.

## Tokens

Defined once in `@lingolive/design-tokens`, consumed as CSS custom properties on
the web (`--ll-*`, surfaced to Tailwind 4 via `@theme inline`) and as plain
objects in React Native. One source, two renderers, no drift.

### Colour

| Token                   | Value     | Use                               |
| ----------------------- | --------- | --------------------------------- |
| `primary`               | `#2F6BFF` | The action. Start, join, confirm. |
| `accent`                | `#14A88B` | Live state, success, "recording"  |
| `surface` (light)       | `#FFFFFF` | Cards, tiles                      |
| `background` (light)    | `#F5F7FB` | Page                              |
| `background` (dark)     | `#07111F` | Page                              |
| `ink` / `ink-secondary` |           | Primary and secondary text        |
| `danger`                |           | Destructive actions only          |

There is no purple-to-blue gradient anywhere. It signals "an AI product" rather
than "this will help you understand the doctor", and it is what every other
product in this space looks like.

Contrast is asserted by a test: `contrastRatio()` runs over every foreground /
background pair in both themes and fails below WCAG AA.

### Shape and space

Radii: `sm` 8, `md` 12, `lg` 16, `xl` 24, `full`. Spacing on a 4 px scale.

`MIN_TOUCH_TARGET = 48` — not a suggestion. Every interactive element is at
least 48 × 48 pt, verified by an E2E check and by the Maestro accessibility
flow. `SPEAK_BUTTON_SIZE = 88`, because push-to-talk has to be hittable without
looking.

### Motion

150–220 ms, standard easing. Long enough to be understood, short enough to stay
out of the way.

Every animation respects `prefers-reduced-motion` / the platform reduce-motion
setting. The Playwright suite runs with `reducedMotion: 'reduce'` so the tests
measure behaviour, not animation timing.

### Type

Native system fonts on mobile (San Francisco, Roboto). Not a bundled brand face:
system fonts are what a screen reader, Dynamic Type and the user's own
accessibility settings expect, and they are already on the device.

Transcript text scales independently of the rest of the interface, because that
is the text people actually need to enlarge.

## Screens

### Home

Three actions. Listen, Discuss, Join. Nothing else competes with them.

No account prompt, no upsell, no carousel, no "what's new". The first thing a
new user sees is the thing they came for.

### Listen

One decision: the language you read. Then a large, unmistakable start control.

Live: the transcript fills the screen. Partial text is visually provisional —
lower opacity, no settled styling — and settles into final text in place. The
recording indicator is permanent and cannot be dismissed while a session runs.

Autoscroll follows the newest line and **stops the moment the user scrolls up**,
with a "jump to live" affordance. Nothing is more hostile than a transcript that
yanks you away from the sentence you are re-reading.

### Discuss

2, 3 or 4 tiles. Layout comes from `layoutPlacements()` in `realtime-core`, so
web and mobile place tiles identically.

Each tile has its own language, its own rotation and its own push-to-talk
button. The active speaker is unambiguous — the tile that is speaking is
visibly the one that is speaking.

**Rotation, done properly.** A naive `transform: rotate(90deg)` on a wide tile
puts its content off screen. Instead the tile _box_ stays put and only its
content rotates, sized in container-query units:

```css
.ll-tile {
  container-type: size;
  overflow: hidden;
}
.ll-tile-content {
  position: absolute;
  inset: 0;
  transform: rotate(var(--ll-tile-rotation));
}
.ll-tile[data-quarter-turn='true'] .ll-tile-content {
  inset: auto;
  top: 50%;
  left: 50%;
  width: 100cqh;
  height: 100cqw; /* swap the axes for a quarter turn */
  transform: translate(-50%, -50%) rotate(var(--ll-tile-rotation));
}
```

This was found by an end-to-end run, not by reading the code.

### Join

Three equivalent doors: scan, type, or arrive by link. The code field accepts
`728416`, `728 416` and `728-416` — people read codes aloud and type them with
the separators they heard.

No account at any point.

### Settings

Where the privacy promises are visible and actionable: what is stored, how to
delete one transcript, how to delete everything. Not buried, not behind a
support link.

## Internationalisation

Seven interface languages: English, French, Arabic, Spanish, Portuguese
(Brazil), Italian, German. 34 spoken/reading languages.

- **No hard-coded strings.** Every user-visible string comes from
  `@lingolive/i18n`, and a missing key is a type error.
- **No flags.** A flag is a country. Arabic is not Saudi Arabia, Portuguese is
  not Portugal, Spanish is not Spain, English is not the United States. Language
  names are endonyms — `العربية`, `Deutsch`, `Português (Brasil)`.
- **Language search folds diacritics**, so `portugues` finds `Português`.
- **Switching language keeps your place.** `/en/pricing` → `/fr/pricing`, not
  back to the home page. (This too was an E2E finding.)

### Right-to-left

Arabic is a first-class layout, not a translation pasted into a Latin design.

- The document `dir` follows the locale; the layout mirrors.
- Logical properties (`start`/`end`) throughout, never `left`/`right`.
- Direction is a property of the _text_, not of the tile: an Arabic line inside a
  tile rotated 90° still reads right-to-left correctly.
- Mixed content — an Arabic sentence containing a Latin proper noun — renders
  with correct bidi isolation.

## Accessibility

Target: **WCAG 2.2 AA**.

| Requirement                         | How                                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Contrast                            | Asserted by a unit test over every token pair, both themes                                               |
| Target size (2.5.8)                 | `MIN_TOUCH_TARGET = 48`, checked in E2E and Maestro                                                      |
| Keyboard (2.1.1)                    | Every web control reachable and operable; visible focus rings                                            |
| Name, role, value (4.1.2)           | Explicit roles and labels on every control, including each discussion tile's button                      |
| Status messages (4.1.3)             | Polite live region for finals                                                                            |
| **Partial text is never announced** | Announcing every delta would interrupt a screen reader several times per second, making the app unusable |
| Resize text (1.4.4)                 | Dynamic Type on iOS, font scale on Android, independent transcript scaling on all platforms              |
| Reflow (1.4.10)                     | No horizontal scrolling at 320 px; wide content scrolls inside its own container                         |
| Reduced motion                      | Respected everywhere; the E2E suite runs in this mode                                                    |
| Zoom                                | `maximumScale: 5`, `userScalable: true` — pinch-zoom is never blocked                                    |

`.maestro/accessibility.yaml` walks the app with the accessibility tree and
asserts labels and target sizes on real devices.

## What is deliberately not in the interface

- Fake activity ("2,417 conversations today").
- Testimonials for a product with no users yet.
- A "powered by AI" badge. It is obvious, and it is not a feature.
- An onboarding carousel between the user and the product.
- Any element that moves while someone is trying to read a translation.
