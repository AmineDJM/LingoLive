# Product

## What LingoLive is

A phone on a table that lets people who do not share a language understand each
other, right now, without either of them learning anything new.

Speech becomes text. Text becomes translation. Both appear while the person is
still speaking.

## Who it is for

Not "global teams". Real situations where a language gap has a cost:

- A patient in a waiting room being told what happens next.
- A tenant at a housing office who needs to understand a form.
- A parent at a school meeting about their own child.
- A worker on a site being briefed on safety.
- A traveller at a counter where nobody speaks their language.
- Someone attending a talk, a service or a class in a language they do not read.

These people are not shopping for a translation app. They are in a situation
they did not choose, often stressed, often on a borrowed or low-end phone, often
with one hand. That is the design constraint that matters most.

## The three actions

The home screen has three choices and no fourth one.

### Listen

Someone is speaking; you need to follow.

One language choice — the language _you_ read. Press start, and the words
appear. Partial text is visibly provisional; final text is settled. You can
pause, resume, and end.

Nothing is saved unless you press save.

### Discuss

Two, three or four people around one device.

Each person gets a tile. Each tile has:

- its own reading language,
- its own rotation (0°, 90°, 180°, 270°) so the person on that side reads the
  right way up,
- its own push-to-talk button.

One person speaks, and everyone else's tile shows it in their language. A turn
is transcribed once and translated once per _distinct_ language: four people
using two languages costs two translations, not four.

### Join

Someone else is running a session; you want to read it.

Three ways in, all equivalent:

- scan a QR code,
- type a 6-digit code,
- open a link (`lingolive://join/728416` or `https://<domain>/join/728416`).

No account. On the web, no install. Pick your reading language and you are in.

## What is deliberately absent

Every item here was considered and left out on purpose. Adding any of them would
make the product worse for the person in the waiting room.

| Absent                                                      | Why                                                                                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A sign-up screen before first use                           | Value first. An account is offered once the product has already worked, not before.                                         |
| A context or template picker ("medical", "legal", "travel") | It is a decision the user should not have to make while stressed, and it makes people wrong about what the product will do. |
| Flags for languages                                         | A flag is a country. Arabic is not Saudi Arabia; Portuguese is not Portugal; Spanish is not Spain. Endonyms only.           |
| Voice output / speech synthesis                             | A different product with different failure modes. Reading is more reliable in noise, and more private.                      |
| Saving audio                                                | See `docs/PRIVACY.md`. There is no version of storing audio that is worth it here.                                          |
| A conversation "history" that fills up by itself            | Nothing is kept unless asked for. An empty history is the correct default state.                                            |
| Streaks, badges, gamification                               | Nobody wants a streak for their doctor's appointment.                                                                       |
| Testimonials or usage statistics on the marketing site      | There are none to report. Inventing them is lying.                                                                          |
| A fourth main action                                        | Three is what fits, comprehensibly, on one screen in seven languages including German and Arabic.                           |

## What is out of scope for this build

- **LingoCall** — a different product.
- **The LingoBusiness organizer dashboard** — the _participant_ side is built in
  full (join by code/QR/link, per-viewer language, fan-out, viewer counts). The
  organizer-facing dashboard is not, and a development-only simulator stands in
  for it so the participant side is testable end to end.

## Success, defined honestly

A session is successful when the person who needed to understand something
understood it, and when nothing about that conversation outlived the moment.

Not: minutes of engagement, sessions per week, or retention.

## Honest limits

LingoLive is machine transcription and machine translation.

- Accuracy depends on background noise, accents, overlapping speech and how
  clearly people speak.
- It is **not** a certified or sworn interpreter.
- It should not be the only basis for a medical, legal or financial decision.

These sentences appear in the product, in the store listings and on the
marketing site. They are not fine print; they are part of the offer.

## Pricing shape

Free minutes every month for a guest, more for an account, more still for a
paid plan. Every limit is configuration, not a constant in the code
(`docs/COST_CONTROLS.md`). A guest is never asked to pay before the product has
demonstrably worked for them.
