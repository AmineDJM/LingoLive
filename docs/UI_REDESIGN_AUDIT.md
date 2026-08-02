# UI audit, before the redesign

Measured on the working tree, not remembered. Every number below came from a
command, and the commands are given so the same numbers can be taken again
after the work to show what moved.

## What exists

**Web — 11 routes.** Marketing (`/`, `/[...slug]`), the three actions (`listen`,
`discuss`, `join`, `join/[code]`), plus `app` (in-app home), `history`,
`settings`, `admin`, and `offline`.

**Web — 14 components.** `ui.tsx` holds the shared primitives; the rest are one
component per screen (`listen-screen`, `discuss-screen`, `join-screen`,
`history-screen`, `settings-screen`, `admin-console`), plus `transcript`,
`language-picker`, `language-switcher`, `site-chrome`, and three non-visual
helpers.

**Mobile — 10 screens** under Expo Router, including an onboarding the web has
no equivalent of.

## What is wrong

### 1. The type scale exists and is not used

```
grep -rhoE "text-\[[0-9]+px\]" apps/web --include=*.tsx | sort | uniq -c
```

**81 hard-coded font sizes across 7 distinct values** — 15, 13, 17, 14, 16, 28,
12 px — written inline in components. `design-tokens` already defines a full
scale (`display`, `h1`, `h2`, `title`, `body`, `bodySmall`, `caption`), and
almost nothing reads it.

This is the single biggest source of inconsistency, and it is invisible in
review: every one of those values looks reasonable on its own line. Together
they mean there is no typographic system, only 81 local decisions. It also
breaks the project's own rule that no component hard-codes a design value.

### 2. Only five of the eleven screens use the shared card

```
grep -rc "border border-border bg-surface" apps/web --include=*.tsx
```

Eight files build a card by hand from border + surface + padding rather than
using `<Card>`. Each hand-built one has slightly different padding and radius,
so surfaces that should be siblings are not.

### 3. Radii are bunched at one value

17 uses of `--radius-md` against 3 of `lg` and 2 of `xl`. The scale has five
steps and the product uses one of them for nearly everything, which is why the
interface reads as uniform rather than hierarchical — a hero card and a chip
have almost the same corner.

### 4. There is no colour beyond blue

The palette has exactly one accent (`primary`) plus semantic red/green/amber.
Discuss puts two to four people on one screen and has **no way to give them
distinct identities** — every tile is the same blue with a different language
label. The product's most distinctive screen is its least distinctive-looking.

### 5. Motion is declared but barely used

`duration` and `easing` tokens exist. Two animations use them: the live dot and
the segment fade-in. Nothing else moves — no press feedback beyond the recent
`ll-pressable`, no transitions between states, no page transitions.

### 6. Web and mobile share tokens but not composition

Mobile imports `@lingolive/design-tokens` in 13 places, so colour and spacing
agree. But there are no shared component _contracts_: a card on web and a card
on mobile are independently written, so they drift on padding, radius and
weight without anything failing.

### 7. Empty and error states are text, not design

Every empty state is a paragraph of muted text. No illustration, no suggested
action, nothing that makes an empty history feel like a beginning rather than a
fault.

## What is already right, and must survive

Worth stating, because a redesign can quietly destroy these:

- **Logical properties throughout.** `start`/`end`, never `left`/`right`. Arabic
  is a first-class layout, not a flipped afterthought.
- **No flags for languages.** Endonyms only.
- **Touch targets.** 48 px minimum, enforced globally in CSS.
- **Focus is always visible** and now follows each element's own radius.
- **Reduce Motion** is honoured globally.
- **Contrast is unit-tested.** `design-tokens` asserts WCAG ratios, so a palette
  change that breaks accessibility fails CI rather than shipping.
- **The transcript scales** 0.75×–2.5× and the layout holds.
- **33 end-to-end tests** across desktop, mobile and tablet viewports.

That last one is the constraint that shapes everything: the redesign has to keep
every one of those green, because they encode the product's behaviour, not its
appearance.

## Order of work

Following the brief's own sequence, and delivering in increments that each pass
lint, typecheck, tests and build:

1. Design system v2 — palette, type scale, radii, elevation, motion, breakpoints
2. Navigation and the home screen
3. Listen
4. Discuss
5. Join and the Business participant view
6. History, settings
7. Marketing site
8. States and errors
9. Dark mode, RTL, accessibility pass
10. Screenshots and the report

## How this is verified

Not by eye. After each increment:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm check:secrets
pnpm --filter @lingolive/web exec playwright test   # desktop, mobile, tablet
```

And the two greps above re-run, so "the type scale is now used" is a number
rather than a claim.
