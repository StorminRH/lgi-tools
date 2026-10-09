# Encryption plan review: session handoff

Last updated 2026-10-09. Read this first, then `README.md`.

## What this is

The owner (solo developer, about 18 users, three of them the owner's own accounts) is reviewing the encryption plan for LGI.tools part by part with Claude, so no agent invents surprise "hard rules" later. Each part file in `review/` has the draft, followed by an **Owner review outcome** section at the top that overrides the draft wherever they disagree. Some parts also carry **Carried from …** notes added by earlier reviews.

## How to run the review

- Work only on branch `encryption-plan`. These are docs-only pushes: no tests, typecheck or `pnpm check` (owner instruction).
- Take one part at a time. Explain it in plain English, with no jargon dumps. The owner often listens through text-to-speech.
- Before presenting a part, verify it. Ultracode is on, so run a small Workflow (about 3 checker agents plus adversarial verifiers) covering three things:
  1. the part's claims about today's code;
  2. the external platform facts (AWS, Convex, Better Auth, GitHub and so on);
  3. conflicts with agreed decisions and any over-engineering.

  Present the findings after the workflow completes, and save them as a "Verification findings" note in the part file.
- Ask the questions, recommending one option each. Break a part into short steps of one question each (the owner asked for this in Part 07: a whole part at once is too much), and record and push each answer before the next step. When the owner asks a follow-up, check it in the code and external sources (subagents are fine) before answering. Wait for the owner's answer. Do not move to the next part until the owner says "ready". Batches of clean-ups are fine to approve together.
- Record every decision immediately in the part's Owner review outcome section. Mark the part `Agreed <date>` and update the status table in `README.md`. Add "Carried from …" notes to later parts the decision affects. Commit and push after each decision.
- Check facts in the code rather than recalling them. The owner has corrected guesses before: EVE character and corp names never change, the market is seeded, and Neon is in us-east-1.

## Owner principles (README "Guiding principles")

1. Users notice nothing.
2. Encrypt only content; metadata stays readable.
3. LGI's servers do the bulk of the work, then the sealed service, then the browser. Rely on the sealed service as little as possible. Page loads, reloads and new tabs never wait on it.
4. EVE SSO is the gate.
5. **Efficiency first.** Convex I/O is the cost driver. Keep indexes, and add no padding or dummy writes.
6. **Guard stored and logged data, not the owner's own code.** In-memory request contents are not guarded.

Further owner preferences:
- Avoid over-engineering for 18 users.
- Everything must be automated inside the current deploy flow, which is merges to `staging` and `main` on Vercel.
- No new user-facing messages unless needed.

## Status

Parts 01–07 are **agreed**. Part 08 is next and has not been verified yet. Parts 08–32 have not started.

Key agreed outcomes are in each part file. Highlights:
- **Infrastructure:** one Nitro Enclave image on one `c7g.large` in us-east-1. Vercel, Neon, Convex and Upstash are all in us-east-1.
- **Cost:** pay-as-you-go during setup (new account credits), then a 1-year Savings Plan at release.
- **Releases:** automated blue/green through a GitHub Action on the same merges. The KMS policy holds only the running hash.
- **Fingerprints:** an append-only fingerprint list, committed in the same PR by the agent.
- **Outages:** no sign-in during an outage. A "Login server" row is added to the TQ status popover.
- **Data shape:** signatures are readable, systems are sealed, and keyed tags keep indexes.
- **Phase 0 (Part 04):** a set of leak fixes, plus the role-audit bug fix and the sign-in error message fix.
- **Channel (Part 07):** requests relay through Convex as a short-lived mailbox (no `userId`, deleted hourly); each request carries a per-session HMAC stamp from the login reply, plus a live Neon session check; the enclave writes Convex with a shared secret; no job inbox and nothing on Vercel waits on the enclave (sign-in passes through Vercel and the browser reads its reply from Convex); the channel key is kept across restarts; two deadlines (20 s reads, 30 s writes); about 5–6 Convex calls per map edit; access lists and map creation stay on Vercel; non-wormhole identify stays a direct Convex call; map character search is a stamped lookup with a 5 s exact-name fallback; the enclave runs today's ESI gate code with its own tally, one admin view, one pause switch, one alert and today's User-Agent.

## Where we stopped: Part 07 agreed; Part 08 next, waiting for "ready"

Part 07 is agreed (2026-10-09) and its knock-on notes are in Parts 06, 08–13, 15–19, 23, 29 and 31. When the owner says "ready", verify **Part 08: EVE login, token custody and token-bearing calls** with a small workflow (today's code, external facts, conflicts with agreed decisions and over-engineering), save the findings in the part file, then present it in short steps. Part 08 already carries a long "Carried from the Part 07 review" note; several of its draft rows (the awaited `characterSearch` job, the 35 s token re-check wait, registrations) are superseded by it.
