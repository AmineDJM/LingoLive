# Design system v2 — Living Language

One source of truth, in `packages/design-tokens/src/index.ts`, read by the web
through CSS custom properties and by React Native as objects. No component
anywhere hard-codes a colour, a radius or a size — that rule is the reason this
file exists, and the audit found 81 places already breaking it.

## The idea

LingoLive turns speech into understanding between people. The interface should
read as **conversation**, not as machinery: colours that belong to people,
surfaces that feel placed rather than drawn, motion that answers rather than
performs.

Two consequences that shape everything below:

- **Colour identifies a person**, not a feature. Discuss is the product's
  signature screen and its whole job is showing who said what.
- **The transcript is the content.** Every other element exists to stay out of
  its way. Nothing decorative may reduce its contrast, its size or its space.

## Colour

### Lingo Blue — the structural colour

A full 50–900 ramp. Three shades force improvisation on every new component,
and improvisation at scale is what the audit measured.

| Step    | Value                 | Used for                 |
| ------- | --------------------- | ------------------------ |
| 50      | `#EEF5FF`             | Tinted surfaces          |
| 100–300 | `#DCEAFF` → `#91BDFF` | Borders, dark-theme text |
| 500     | `#3478F6`             | Primary actions          |
| 600–700 | `#2462DC` → `#1D4EB3` | Hover, text on tint      |
| 800–900 | `#1D438D` → `#1D396F` | Deep accents             |

### Conversation colours — one per person

Eight hues, assigned by seat position in a fixed order: **blue, coral, mint,
violet, mango, aqua, rose, lime**. Fixed because the second person at a table
must be coral on every device and every reload; a colour that changes between
sessions is not an identity.

Each hue carries four values, because an accent cannot do four jobs:

| Field               | Job                                 |
| ------------------- | ----------------------------------- |
| `base`              | The identity — border, dot, fill    |
| `soft` / `softDark` | A surface that can hold text        |
| `text` / `textDark` | The only value legible at body size |

**`text` is derived, not chosen.** Each is the closest darkening of its own hue
that reaches 4.5:1 on its own `soft`, computed rather than eyeballed. This
matters more than it sounds: the raw hues reach **1.7–3.7:1 on white**, so the
obvious thing to do with a colour — write in it — would have failed AA for all
seven. Fourteen unit tests assert the derived pairs, so a future palette tweak
that breaks legibility fails CI instead of shipping.

### Neutrals

Light backgrounds `#F5F7FB`, surfaces `#FFFFFF`, borders `#E6EAF0`. Dark is a
designed theme, not an inversion: a blue-leaning night (`#090F1C` background,
`#111A2B` surfaces) so that white text is not glaring in a dark conference room
or on a plane.

One deliberate deviation: **muted text is `#6F7683`, not the `#98A2B3` a muted
grey wants to be.** That value reaches 2.58:1 on white — below AA for any text.
Muted is a hierarchy signal, not permission to become unreadable. Asserted by a
test.

## Type

The scale exists in tokens: `display 40 / h1 32 / h2 26 / title 20 / body 17 /
bodySmall 15 / caption 13`, plus a transcript range of 20–30 px that the user
scales 0.75×–2.5×.

**Tracking is optical.** Letter-spacing tightens as size grows
(`display -0.022em` → `body -0.006em`) and opens up below body size
(`label +0.006em`). Large type at default spacing looks typed rather than set —
the words stop reading as a single shape.

Grayscale antialiasing is forced: subpixel rendering fattens medium weights just
enough that headings read a step bolder than they are.

## Shape

| Token  | Value | Used for               |
| ------ | ----- | ---------------------- |
| `sm`   | 12    | Chips, small controls  |
| `md`   | 16    | Buttons, inputs        |
| `lg`   | 20    | Standard cards         |
| `xl`   | 24    | Main cards             |
| `hero` | 32    | The three home actions |
| `full` | 999   | Pills                  |

Spread deliberately. The audit found one step used 17 times against 5 for all
others combined, which is why every surface read as the same weight. Radius is
how large a thing is meant to feel.

## Depth and materials

Elevation is **two shadows, never one**: a tight contact shadow that anchors the
edge plus a wide ambient one. One blurred shadow reads as a drop shadow; two
read as an object resting on a surface.

`card` · `raised` · `pressed` (inset) · `speaking` (a green ring for whoever
holds the floor).

Materials are translucent surfaces the page blurs through — `bar` for headers,
`sheet` for dialogs. A bar you can see through belongs to the page instead of
covering it, and shows there is more above without a rule announcing it. The
opaque colour is always the base, so nothing depends on `backdrop-filter`.

## Motion

| Class                          | Duration   |
| ------------------------------ | ---------- |
| Micro feedback                 | 150 ms     |
| Standard transition            | 180–220 ms |
| The live pulse (the only loop) | 1600 ms    |

Easing: `standard`, `decelerate`, `accelerate`, and `spring` — a gentle
overshoot for something arriving rather than being placed. Deliberately gentle:
at a real spring's amplitude it reads as a wobble, and a wobble on every button
press is a tic.

Every control uses `ll-pressable`: a 3% scale that answers the finger and eases
back. It is the one animation that fires constantly, so it sits below the
threshold of something you would call an animation — you notice its absence, not
its presence.

**All of it collapses under `prefers-reduced-motion`.** Not shortened: removed.

## Space and breakpoints

Spacing: `2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`.

Breakpoints: `xs 360 · sm 480 · md 768 · lg 1024 · xl 1280 · xxl 1536`.

Named for the device that fails at each one. A compact phone in portrait and a
tablet lying flat between four people are different products, not one scaled —
Discuss is unusable if either is treated as a version of the other.

## The rules that outrank aesthetics

In order. When they conflict with a visual idea, the visual idea loses.

1. **Contrast is tested.** 37 unit tests, including all seven conversation
   colours in both themes. A palette change that breaks AA fails CI.
2. **48 px touch targets**, enforced globally in CSS, not per component.
3. **Logical properties only** — `start`/`end`, never `left`/`right`. Arabic is
   a first-class layout.
4. **No flags for languages.** Endonyms.
5. **Focus is always visible**, and follows each element's own radius.
6. **Nothing may reduce transcript legibility.** No overlay, no tint, no
   decorative layer over the content the product exists to deliver.
