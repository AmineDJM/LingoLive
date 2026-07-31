# App privacy answers (App Store Connect)

The answers below match what the code actually does. Where an answer depends on
a deployment choice, that is marked **[depends]** and must be re-checked before
submission — a privacy label that is wrong is a rejection _and_ a
misrepresentation to users.

## Does this app collect data?

**Yes** — but far less than the default assumption. Section by section:

### Contact info

| Type           | Collected | Linked to identity | Used for tracking | Purpose           |
| -------------- | --------- | ------------------ | ----------------- | ----------------- |
| E-mail address | Optional  | Yes                | No                | App functionality |

Only if the user creates an account. Guest mode collects no contact info at
all, and guest mode is the default.

### User content

| Type               | Collected | Linked | Tracking | Purpose           |
| ------------------ | --------- | ------ | -------- | ----------------- |
| Audio data         | **No**    | —      | —        | —                 |
| Other user content | Optional  | Yes    | No       | App functionality |

_Audio data: not collected._ Audio is streamed for transcription and is never
written to storage — not on the device, not on the server, not with a
provider. "Other user content" is a transcript, and only when the user
explicitly saves one.

### Identifiers

| Type      | Collected | Linked | Tracking | Purpose           |
| --------- | --------- | ------ | -------- | ----------------- |
| User ID   | Yes       | Yes    | No       | App functionality |
| Device ID | **No**    | —      | —        | —                 |

The "user ID" is an identifier the app generates for itself on first launch. It
is not an advertising identifier, it is not the IDFA, and it is not the vendor
identifier. The app does not call `ASIdentifierManager` and does not request
tracking authorisation.

### Usage data

| Type                | Collected     | Linked | Tracking | Purpose   |
| ------------------- | ------------- | ------ | -------- | --------- |
| Product interaction | **[depends]** | No     | No       | Analytics |

Analytics is **off by default** (`ANALYTICS_ENABLED=false`). If you enable it,
answer _Yes_, _not linked_, _not used for tracking_. The event schema is a
closed catalogue of counts, durations and language codes; it cannot carry
conversation content.

### Diagnostics

| Type        | Collected     | Linked | Tracking | Purpose           |
| ----------- | ------------- | ------ | -------- | ----------------- |
| Crash data  | **[depends]** | No     | No       | App functionality |
| Performance | **[depends]** | No     | No       | App functionality |

Only if `SENTRY_DSN` is configured. What is sent is an exception type, a
scrubbed message and a few enum tags — no request bodies, no headers, no user
identity.

### Not collected, at all

Location, contacts, health, financial info, browsing history, search history,
sensitive info, purchases (unless in-app purchase is enabled — **[depends]**),
and any advertising identifier.

## Tracking

**This app does not track you.** No data is linked with third-party data for
advertising or measurement, and no data is shared with a data broker. Therefore
no App Tracking Transparency prompt is shown.

## Privacy policy URL

`https://<your-domain>/en/privacy` — the localized versions are linked from it
via `hreflang`, and the app links to the user's own language.

## Required-reason API declarations

The app uses `UserDefaults` for its own settings: reason **CA92.1** (access
only to app-scoped data). No other required-reason API category applies —
verify with `expo prebuild` output before each release, as an added dependency
can introduce one.

---

**Re-check every time** the provider set, the analytics flag, the billing
provider or the authentication provider changes. This file is the record of
what was declared and why.
