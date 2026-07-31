# Privacy Policy — DRAFT

> **Draft, pending legal review.** Placeholders in `[BRACKETS]` must be filled.
> Retention periods must be checked against the deployed configuration. See
> `docs/legal/README.md`.

**Last updated:** [DATE]
**Controller:** [LEGAL ENTITY], [CONTACT ADDRESS]
**Contact:** [PRIVACY CONTACT EMAIL]

## In one paragraph

LingoLive turns speech into text and translates it live. Your audio is never
recorded and never stored — it is converted to text and discarded. Transcripts
are not kept unless you explicitly save them. You do not need an account. You
can delete everything from inside the app at any time.

## 1. What we process

### Audio

Audio from your microphone is transmitted, while a session is running, so that
it can be converted to text.

**It is not recorded and it is not stored.** Not on your device, not on our
servers, not by our processors for their own purposes. Once it has been turned
into text it is gone.

### Transcripts and translations

| Kind of session                                 | Kept for                                   |
| ----------------------------------------------- | ------------------------------------------ |
| Personal session you did **not** save           | Up to [1 hour], then deleted automatically |
| Personal session you **saved**                  | Until you delete it                        |
| Business session (a session you joined by code) | [7 days], then deleted automatically       |

Transcript and translation text is encrypted before it is stored.

### Account and device data

- If you use LingoLive as a guest — the default — we hold an identifier your
  device generated for itself. It is stored as a hash. It is not an advertising
  identifier and it is not the identifier your operating system exposes to
  advertisers.
- If you create an account, we hold your e-mail address and your preferences.

### Usage data

Session start and end times, duration, language pairs, and the resulting
consumption. We use this to enforce fair-use limits and to control cost.

### Technical logs

Error codes, routes, HTTP statuses and request identifiers, kept for
[30 days]. **These logs cannot contain what you said**: content is removed
before anything is written, by design and not by policy.

### Analytics

Disabled by default. If enabled, only counts, durations and language codes are
collected, from a fixed list of events. The schema is structurally incapable of
carrying conversation content, and the identifier used is derived so that it
cannot be joined back to your account.

## 2. Why we process it

| Purpose                                      | Basis (indicative — confirm with counsel) |
| -------------------------------------------- | ----------------------------------------- |
| Providing live transcription and translation | Performance of a contract                 |
| Keeping a transcript you asked to save       | Performance of a contract                 |
| Enforcing usage limits and preventing abuse  | Legitimate interests                      |
| Security and fraud prevention                | Legitimate interests                      |
| Optional analytics                           | Consent                                   |
| Optional crash reporting                     | Legitimate interests                      |

## 3. Who else is involved

| Processor                               | What they receive                                | When                       |
| --------------------------------------- | ------------------------------------------------ | -------------------------- |
| [AI PROVIDER — OpenAI, by default]      | Audio for transcription; text for translation    | Only during a live session |
| [HOSTING PROVIDER — Render, by default] | Hosting and database                             | Always                     |
| [ERROR REPORTING — optional]            | Exception type, scrubbed message, technical tags | Only if configured         |
| [ANALYTICS — optional]                  | Counts and language codes                        | Only if enabled            |

We do not sell your data. We do not share it with advertisers. We do not use it
to train models.

**[Confirm the processing locations and the transfer mechanism for each
processor with counsel.]**

## 4. Your rights

Depending on where you live you may have the right to access, correct, delete,
restrict, port or object to the processing of your data, and to withdraw consent.

You do not have to write to us to exercise the important ones:

- **Delete everything** — in the app: Settings → Delete my data.
- **Delete one transcript** — in the app: History → the transcript → delete.
- **Export a transcript** — in the app.

For anything else, contact [PRIVACY CONTACT EMAIL]. We respond within
[TIMEFRAME].

You may also lodge a complaint with your supervisory authority.

## 5. Children

LingoLive is not directed at children under [AGE]. We do not knowingly collect
data from them.

## 6. Consent of other people in the room

LingoLive transcribes what its microphone hears, which may include people other
than you. Whether everyone present has consented, and whether their consent is
required, depends on where you are and what the situation is.

**That responsibility is yours.** The app shows a permanent, unmissable
indicator while a session is running, so that it is visible to everyone present.
That is a technical measure, not legal cover.

## 7. Security

Encryption in transit, application-layer encryption of transcripts at rest,
strict access controls, and administrative access to conversation content that
is separately gated and permanently audited. Details in `docs/SECURITY.md`.

No system is perfectly secure, and we do not claim otherwise.

## 8. Changes

We will post changes here and update the date above. Material changes will be
notified in the app.

## 9. What we do not claim

This document describes what our software does. It does **not** claim that
LingoLive is certified as compliant with the GDPR, HIPAA, CCPA or any other
regime. Compliance is established by audit of a deployed service and its
operator, not asserted in a policy.

---

> **Draft. Do not publish before legal review.**
