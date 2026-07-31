# Architecture Decision Records

Each ADR records a decision that would be expensive to reverse, the
alternatives considered, and the consequences accepted.

| #                                         | Decision                                                       | Status   |
| ----------------------------------------- | -------------------------------------------------------------- | -------- |
| [0001](0001-monorepo-and-tooling.md)      | pnpm + Turborepo monorepo                                      | Accepted |
| [0002](0002-expo-development-build.md)    | Expo with a Development Build (not Expo Go)                    | Accepted |
| [0003](0003-separate-nextjs-app.md)       | A separate Next.js app for SEO and the web product             | Accepted |
| [0004](0004-mobile-realtime-transport.md) | Mobile realtime transport                                      | Accepted |
| [0005](0005-auth-provider.md)             | Pluggable `AuthAdapter` with a local development mode          | Accepted |
| [0006](0006-text-translation-pipeline.md) | Text translation, not speech-to-speech, in V1                  | Accepted |
| [0007](0007-no-audio-storage.md)          | Audio is never persisted                                       | Accepted |
| [0008](0008-business-fanout.md)           | Business fan-out: transcribe once, translate once per language | Accepted |
| [0009](0009-prisma-6-and-typescript-5.md) | Prisma 6.x and TypeScript 5.9 rather than the newest majors    | Accepted |
| [0010](0010-admin-observability.md)       | Total operator observability with an audited transcript gate   | Accepted |
