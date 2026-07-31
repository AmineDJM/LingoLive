# App Review notes

Paste this into **App Store Connect → App Review Information → Notes**.

---

LingoLive transcribes speech and translates it in real time. It has three
actions: Listen, Discuss and Join.

**No account is required.** The app works immediately as a guest. There is
nothing to sign in to and no paywall in front of the core experience, so no
demo account is needed. If you would like one anyway, contact us and we will
provide credentials.

**How to test each action**

1. _Listen_ — Tap Listen, choose a reading language, allow the microphone, and
   speak (or play any speech near the device). Text appears as it is spoken and
   is translated into the chosen language.
2. _Discuss_ — Tap Discuss and choose 2, 3 or 4 people. Each tile has its own
   language and can be rotated so the person sitting on that side of the device
   reads the right way up. Hold the button on a tile to speak; everyone else
   sees the translation.
3. _Join_ — Tap Join and enter the code we supplied with this build, or scan
   the QR code from the same page. This joins a session created elsewhere; it is
   how an attendee follows a talk or a service in their own language.

**Permissions**

- _Microphone_ — required for transcription. Requested only when a session
  starts, after a screen explaining why. Audio is streamed for transcription and
  is never recorded or stored.
- _Camera_ — used only to scan a session QR code. The app is fully usable
  without it: the same session can be joined by typing the 6-digit code.

There is no background audio capture. A session suspends when the app leaves
the foreground.

**Privacy**

- Audio is not stored. Anywhere. It is converted to text and discarded.
- Transcripts are not saved unless the user explicitly asks to save one.
- Analytics is disabled by default, and the event schema is a closed list of
  counts and language codes — it cannot carry conversation content.
- Account and data deletion is available inside the app: Settings → Delete my
  data, no e-mail, no support ticket, no waiting.

**Third-party processing**

Speech is sent to our own server, which relays it to OpenAI for transcription
and translation. The provider API key exists only on our server; the app never
holds it. This is disclosed in the privacy policy and in the privacy nutrition
labels.

**Accuracy claims**

The listing states plainly that this is machine translation, that it is not a
certified interpreter and that it should not be the only basis for a medical,
legal or financial decision. We make no accuracy percentage claims anywhere.

**Right-to-left**

The interface ships in Arabic with a full RTL layout, including in the rotated
discussion tiles. Switching the device to Arabic is a good test of this.

---

## Contact for review

| Field      | Value                                     |
| ---------- | ----------------------------------------- |
| First name | _(fill in)_                               |
| Last name  | _(fill in)_                               |
| Phone      | _(fill in)_                               |
| E-mail     | _(fill in — must be monitored)_           |
| Demo code  | _(a live 6-digit join code, if provided)_ |
