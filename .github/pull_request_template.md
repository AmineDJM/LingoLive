# What this changes

<!-- One or two sentences. What is different for the person using LingoLive? -->

## Why

<!-- The problem, not the solution. Link the issue if there is one. -->

## How to verify

<!-- The exact commands or steps a reviewer runs. -->

```bash
pnpm bootstrap
pnpm dev
```

## Checks

- [ ] `pnpm check:all` passes (format, lint, types, tests, secret scan)
- [ ] Tests cover the change, including the failure case
- [ ] No hard-coded user-facing string — everything goes through `@lingolive/i18n`
- [ ] Checked in Arabic (RTL) if any layout or text direction is touched
- [ ] Touch targets stay ≥ 48pt; the change is usable with VoiceOver/TalkBack
- [ ] No transcript, audio or credential can reach a log, an analytics event or a cache
- [ ] The OpenAI key stays server-side; nothing new is exposed via `EXPO_PUBLIC_*`/`NEXT_PUBLIC_*`
- [ ] A migration, if any, is reversible or documented in `docs/DATABASE.md`
- [ ] Documentation updated (`docs/`, ADR if the decision is architectural)

## Screenshots / recordings

<!-- For anything visual. Light and dark, and RTL if relevant. -->

## Risk

<!-- What could break, and what to watch after deploy. "None" is a valid answer
     only if you have thought about it. -->
