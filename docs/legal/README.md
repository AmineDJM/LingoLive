# Legal texts

> **These are drafts. They are not legal advice and they have not been reviewed
> by a lawyer.**
>
> They describe accurately what the software does, which is the useful part a
> non-lawyer can contribute. Turning that into an enforceable document that fits
> your jurisdiction, your entity and your users is a lawyer's job, and it has not
> been done.

## What is here

| File                  | Status                                           |
| --------------------- | ------------------------------------------------ |
| `privacy-policy.md`   | Draft — technically accurate, legally unreviewed |
| `terms-of-service.md` | Draft — technically accurate, legally unreviewed |

The same texts are published as pages at `/<locale>/privacy` and
`/<locale>/terms` in all seven interface languages, from
`apps/web/content/pages-legal.ts`. Those are the ones users see; keep them in
step with these.

## Before publishing

1. **Have a lawyer review both.** In every jurisdiction you operate in.
2. **Fill in the placeholders.** `[LEGAL ENTITY]`, `[JURISDICTION]`,
   `[CONTACT ADDRESS]`, `[DPO CONTACT]` — every one of them.
3. **Verify the retention periods** against your actual deployed configuration.
   The defaults in the text are the defaults in `.env.example`; if you changed
   them, the text is wrong.
4. **Verify the sub-processor list.** It reflects `AI_PROVIDER=openai` plus
   optional Sentry and PostHog. A different configuration means a different list.
5. **Check your backup retention.** A backup that outlives the stated retention
   window contradicts the policy: restoring it restores data that was supposed to
   be gone.

## What these texts deliberately do not say

They do not claim compliance with GDPR, HIPAA, CCPA or any other regime. A
repository cannot be compliant; a deployed service operated by an organisation
can be, after an audit. Anyone who tells you otherwise is selling something.

They also do not claim the product is a substitute for a professional
interpreter, because it is not.
