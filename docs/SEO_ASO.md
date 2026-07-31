# SEO and ASO

## The rule that shapes everything

Someone searching "how do I understand my doctor when I don't speak the
language" is not searching for an AI feature list. They are in a situation.

Every public page answers a situation. None of them is a keyword page with a
product paragraph pasted underneath.

## Site structure

```
/                       → redirects to the visitor's language
/<locale>               home
/<locale>/live-transcription
/<locale>/live-translation
/<locale>/conversation-translator
/<locale>/how-it-works
/<locale>/pricing
/<locale>/conference-captions
/<locale>/meeting-transcription
/<locale>/travel-translation
/<locale>/accessibility/live-captions
/<locale>/guides        + individual guides
/<locale>/help
/<locale>/security
/<locale>/privacy
/<locale>/terms
```

Seven locales: `en`, `fr`, `ar`, `es`, `pt-br`, `it`, `de`. Seventeen pages ×
seven locales, every one with real, distinct content — a test asserts no page is
missing a locale, no field is empty, no section list is empty, and **no two pages
share a title or a description in the same locale**. Duplicate metadata is the
most common self-inflicted SEO wound and it is now impossible to ship.

## Localisation done properly

- **Real URLs per locale**, not a query parameter and not a cookie.
- **`hreflang` on every page**, including `x-default` pointing at English as the
  fallback for a visitor whose language we do not publish.
- **A localized sitemap** listing every locale of every page with its alternates.
- **`lang` and `dir` on the document**, so Arabic renders right-to-left as a
  layout rather than as mirrored Latin.
- **Switching language keeps the page.** `/en/pricing` → `/fr/pricing`. A
  switcher that returns to the home page loses the user and the crawler.

## Structured data

JSON-LD, emitted **only where there is content to describe**:

| Type                  | Where                                   |
| --------------------- | --------------------------------------- |
| `SoftwareApplication` | Home                                    |
| `FAQPage`             | Pages that actually have an FAQ section |
| `HowTo`               | How it works                            |
| `BreadcrumbList`      | Nested pages                            |
| `Article`             | Guides                                  |

No `AggregateRating`. There are no ratings. Inventing them is a manual action
waiting to happen, and it is a lie.

## What is excluded from indexing

Every product surface, in `robots.txt` **and** with `noindex` metadata, because a
page can be reached by a link `robots.txt` never sees:

```
/api/  /*/listen  /*/discuss  /*/join  /*/session/
/*/history  /*/settings  /*/account  /*/admin  /*/auth/  /offline
```

A live session URL or a join code in search results would be a privacy incident,
not an SEO problem.

Non-production deployments disallow everything
(`NEXT_PUBLIC_ALLOW_INDEXING=false`, which is the default outside production), so
a staging copy never competes with production.

## Performance

The marketing pages are statically renderable, ship almost no client JavaScript,
and inline no external fonts. Core Web Vitals targets: LCP < 2.5 s, CLS < 0.1,
INP < 200 ms.

`web-preview.yml` reports the client bundle size on every pull request that
touches the web app, so a regression is visible in review rather than in a field
report.

## Content rules

- No fabricated statistics. No "trusted by 10,000 professionals".
- No testimonials. There are none.
- No competitor comparison tables built from assumptions.
- Every claim about privacy is a claim the code enforces, and each one links to
  the page that explains how.
- The honest-limits paragraph appears on the pages where someone might be about
  to rely on this for something serious.

---

# App Store Optimisation

## Names and subtitles

The app is called LingoLive everywhere. The subtitle carries the value, in the
listing language — `store/metadata/<locale>/subtitle.txt`.

| Locale | Subtitle                    |
| ------ | --------------------------- |
| en     | Live translation, out loud  |
| fr     | La traduction, à voix haute |
| ar     | ترجمة فورية بصوت مسموع      |
| es     | Traducción en directo       |
| pt-BR  | Tradução ao vivo            |
| it     | Traduzione dal vivo         |
| de     | Übersetzung in Echtzeit     |

## Keywords (App Store, 100 characters)

Situations and outcomes, not features. "doctor", "meeting", "travel" earn their
place; "AI-powered" does not — nobody searches for it, and it says nothing about
what the app does for them.

Keywords are per locale and are not transliterations of the English set. The
Arabic keyword field uses Arabic search terms.

## Descriptions

Same structure in all seven languages:

1. One sentence that says what it does.
2. The three actions, each with a real situation attached.
3. Where it is built to work — waiting rooms, counters, classrooms.
4. Privacy, as specifics rather than adjectives.
5. Interface languages.
6. **Honest limits** — machine translation, not a certified interpreter.

Point 6 is not a disclaimer bolted on. It is the last thing a reader sees before
deciding, and it is why they can trust points 1–5.

## Screenshots

Six scenes, in every store language — see `store/screenshots/README.md`. Scene 4
shows an Arabic tile rendering correctly next to a Latin one, because for an
Arabic-reading user that single image says more than the whole description.

Captions are a layer over the screenshot, never inside the app UI, and are kept
under 40 characters so German and Arabic survive without shrinking.

## What the listings never contain

- Invented download or user numbers.
- Accuracy percentages.
- Fake reviews or testimonials.
- Flags as language markers.
- Claims of regulatory compliance.
