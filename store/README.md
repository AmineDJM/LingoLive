# Store listings

Everything the two stores ask for, in the seven languages LingoLive ships.

```
store/
  metadata/<locale>/     the listing text, one file per field
  app-store/             App Store Connect: review notes, privacy answers, checklist
  play-store/            Google Play: data safety, content rating, checklist
  screenshots/           what to capture, and the script that captures it
```

## Locale mapping

The stores use their own locale codes. `metadata/` is keyed by the app's
interface locale; this is how each one maps:

| App locale | App Store Connect | Google Play |
| ---------- | ----------------- | ----------- |
| `en`       | `en-US`           | `en-US`     |
| `fr`       | `fr-FR`           | `fr-FR`     |
| `ar`       | `ar-SA`           | `ar`        |
| `es`       | `es-ES`           | `es-ES`     |
| `pt-BR`    | `pt-BR`           | `pt-BR`     |
| `it`       | `it`              | `it-IT`     |
| `de`       | `de-DE`           | `de-DE`     |

The first locale in the list is the primary listing language. Choose it based
on the launch market, not on the language of the codebase.

## Fields and limits

| File                    | Where it appears                    | Limit |
| ----------------------- | ----------------------------------- | ----- |
| `name.txt`              | App name (both stores)              | 30    |
| `subtitle.txt`          | App Store subtitle                  | 30    |
| `short_description.txt` | Play short description              | 80    |
| `description.txt`       | Full description (both)             | 4 000 |
| `keywords.txt`          | App Store keywords, comma-separated | 100   |
| `promotional_text.txt`  | App Store promotional text          | 170   |
| `release_notes.txt`     | "What's new" (both)                 | 4 000 |

The generator that produced these files asserts every limit, and the Arabic and
German strings are the ones that come closest — check both after any edit.

Play has no equivalent of `subtitle.txt` or `promotional_text.txt`; the App
Store has no equivalent of `short_description.txt`. The extra files are simply
unused for that store.

## Rules these listings follow

- **No invented numbers.** No user counts, no accuracy percentages, no "trusted
  by" claims. There is nothing to substantiate yet, and both stores reject
  unsubstantiated claims.
- **No fake reviews or testimonials**, anywhere, ever.
- **Limits stated in the listing itself.** Every description ends with an honest
  paragraph saying this is machine translation and not a certified interpreter.
  This is not legal cover; it is what the product actually is.
- **No flags.** A flag is a country, a listing field is a language.
- **The privacy claims match the code.** "Audio is never recorded" is true
  because there is no audio storage anywhere in the system — asserted by a test
  and by a CI check, not by a promise.

## Before you upload

Read `app-store/submission-checklist.md` and
`play-store/submission-checklist.md`. Both list the steps that can only be done
by a human with an Apple or Google account, and neither can be automated away.
