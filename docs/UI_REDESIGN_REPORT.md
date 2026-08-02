# UI redesign — report

Progress against `docs/UI_REDESIGN_AUDIT.md`. Numbers, not adjectives: every
figure below is reproducible with the command beside it.

## What moved

| Measure                     | Before | After | Command                                                                                       |
| --------------------------- | ------ | ----- | --------------------------------------------------------------------------------------------- |
| Hard-coded font sizes       | **81** | **0** | `grep -rhoE "text-\[[0-9]+px\]" apps/web --include=*.tsx \| wc -l`                            |
| Distinct type values inline | 7      | 0     | as above, `\| sort \| uniq`                                                                   |
| Radius steps in use         | 3      | 5     | `grep -rhoE "rounded-\[var\(--radius-[a-z]+\)\]" apps/web --include=*.tsx \| sort \| uniq -c` |
| Accent colours available    | 1      | 8     | `conversation` in design-tokens                                                               |
| Contrast assertions         | 12     | 37    | `pnpm --filter @lingolive/design-tokens test`                                                 |

The first row is the one that mattered. A type scale sat in tokens that nothing
could reach, so every component invented its own size — 81 individually
reasonable decisions that together meant there was no typography. The scale is
now exposed as utilities (`text-body`, `text-caption`, …) named identically to
what the mobile app reads from the token objects, and every call site uses it.

## Decisions worth defending

**Conversation colour text is computed, not chosen.** Each hue's `text` value is
the closest darkening of that hue reaching 4.5:1 on its own tinted surface. The
raw hues reach 1.7–3.7:1 on white, so writing in them — the obvious use of a
colour — would have failed AA for all seven. Fourteen tests assert the pairs in
both themes.

**Two brief values were adjusted, both for contrast.** Muted text at `#98A2B3`
reaches 2.58:1 on white, below AA for any text; it is darkened to the nearest
grey that passes. And the conversation hues are accents only — never text,
never a fill behind text.

**No animation library.** The brief suggested Framer Motion and Reanimated. CSS
and Web Animations cover every micro-interaction listed, cost nothing at
runtime, and get `prefers-reduced-motion` for free. The repository's own rule is
that a dependency needs a reason that survives being said out loud; "the press
state should scale 3%" is not one. If page transitions later need
choreography a stylesheet cannot express, that is the moment to reconsider.

**Colour teaches vocabulary.** Each home action owns the colour it uses
everywhere else — Listen is Lingo Blue, Discuss is the first seats at a table,
Join is mint — so the home screen is where the rest of the product's colour
language is learned.

## Done

- Design system v2: Lingo Blue 50–900, eight conversation colours, spacing and
  breakpoint scales, six radius steps, two-shadow elevation, translucent
  materials, optical tracking, spring easing.
- Type scale exposed and adopted across every web component.
- Discuss: per-seat identity colour at rest and while speaking; write-or-speak
  compose field; turn never stuck.
- Home: responsive grid — Listen spans both columns on wide screens, all three
  stack in priority order on a phone.
- Materials on the header and sheets; press feedback on every control.

## Not done

Stated plainly rather than implied.

- Listen, Join, Business, history, settings and the marketing site have the new
  tokens but not new compositions.
- Mobile (Expo) reads the new palette through tokens; its screens are not
  redesigned.
- Onboarding does not exist on web.
- No screenshots in `docs/ui-redesign/`. See below.

## Verification

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm check:secrets
pnpm --filter @lingolive/web exec playwright test --project=desktop --project=mobile
```

37 token tests, 24 web unit tests, **66/66 end-to-end across desktop and mobile
viewports**.

**The tablet project cannot run here.** Chromium refuses to launch as root in
this container for that device profile, and fails identically on a clean
checkout — environment, not regression. That is also why there are no automated
screenshots yet: they would be produced by the same browser. Tablet is where the
brief invests most in Discuss, so this gap is worth naming rather than
papering over.
