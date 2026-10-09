# Encryption plan review: session handoff

Last updated 2026-10-08. Read this first, then `README.md`.

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
- Ask the questions, recommending one option each. Wait for the owner's answer. Do not move to the next part until the owner says "ready". Batches of clean-ups are fine to approve together.
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

Parts 01–06 are **agreed**. Part 07 is in review. Parts 08–32 have not started.

Key agreed outcomes are in each part file. Highlights:
- **Infrastructure:** one Nitro Enclave image on one `c7g.large` in us-east-1. Vercel, Neon, Convex and Upstash are all in us-east-1.
- **Cost:** pay-as-you-go during setup (new account credits), then a 1-year Savings Plan at release.
- **Releases:** automated blue/green through a GitHub Action on the same merges. The KMS policy holds only the running hash.
- **Fingerprints:** an append-only fingerprint list, committed in the same PR by the agent.
- **Outages:** no sign-in during an outage. A "Login server" row is added to the TQ status popover.
- **Data shape:** signatures are readable, systems are sealed, and keyed tags keep indexes.
- **Phase 0 (Part 04):** a set of leak fixes, plus the role-audit bug fix and the sign-in error message fix.

## Where we stopped: Part 07, awaiting the owner's answers

The Part 07 verification is done and saved in `review/07-sealed-channel.md`. The owner asked to take the questions one short step at a time, one question per step, recording and pushing each answer:

1. Who is asking (A) — **agreed 2026-10-08: the stamp** (recorded in Part 07's outcome section)
2. Enclave write credential (the "Also open" item) — **agreed 2026-10-08: shared secret**
3. Background work (B: job inbox, corp recheck, elimination) — **agreed 2026-10-08: all three cuts**
4. Map rules (B: dedupe and versions, access lists and map creation, roles) — **agreed 2026-10-08: all three**
5. Timing and cost (B: deadlines, latency table, status row, Convex cost) — **agreed 2026-10-08: all four** (owner asked for the Convex cost breakdown first; recorded in the outcome)
6. Channel key across restarts (C1) — **agreed 2026-10-08: kept across restarts**
7. User ID on request rows (C2) — **agreed 2026-10-09: dropped** (owner asked why the rows exist; answer recorded in the outcome)
8. Character search and non-wormhole identify (C3, C4)
9. The draft's remaining defaults: JSON messages, login through the Vercel pass-through with today's IP limit, no per-minute limits (draft questions 2, 6, 8)

Resume at the first step not marked agreed. The detail behind each step:

**A. Request authentication (the judgment call).** Someone holding Neon plus Vercel secrets can mint a Convex JWT for any user. If the enclave trusted that token, they could pull a user's keys or personal data without changing any code.

Recommended: keep a check that the token cannot fake, simplified as follows.
- At EVE login the enclave derives a per-session HMAC key from `sessionKeyId` and `accountId`. It returns the key inside the HPKE login reply, and the browser stores it as a non-extractable key.
- Every request carries an HMAC inside the ciphertext.
- The enclave checks the Neon session row (cached 60 s) for revoke and expiry.
- Better Auth keeps its default rolling refresh.
- Drop the sealed registration store, ECDSA, `session.touch` and the `session` class.

The alternative is to trust the JWT, which is simpler but weaker against an operator.

**B. Cuts and fixes (approve as a batch).**
- **Job inbox:** no `sealedJobs` inbox and no awaited jobs. The enclave schedules its own work: ESI jobs from Neon, collapse and purge from the readable `sweepAfter`/`purgeAfter` timestamps, and key wraps and rotation driven by the `mapAccess` projection.
- **Corp recheck:** no corp recheck that makes a page wait. Serve the stored view and rebuild it in the background (Part 23).
- **Elimination:** no follow-up reply slot. Elimination is a second ordinary request, as today.
- **Dedupe and versions:** no 7-day dedupe and no map-wide version (Part 05).
- **Access-list edits and map creation:** stay on Vercel, keeping the 5/min create limit. Map key epoch 0 is created lazily at the first sealed write.
- **Deadlines:** two constants, 30 s and 20 s. `complete` refuses after the deadline. No per-row schedulers; an hourly batch delete clears old rows.
- **Latency:** no latency-budget table.
- **Roles:** today's `requireMapAccess` on the readable `mapAccess` row, re-checked in `complete`.
- **Status row:** read once at login. The lease lives in a separate row.
- **Convex cost:** trim from about 8 calls per edit to about 5–6. Keep the reply small, drop the body when done, and use a longer enclave token.

**C. Smaller choices.**
1. Seal the channel private key under the root key, and keep the previous key across boots. Restarts and blue/green releases then need no rekey. Recommended.
2. Drop `userId` from request rows. Authorize by a random request ID and cap per map. This answers the question carried from Part 03. Recommended.
3. Map character search becomes a browser `lookup` request, which removes the exception. The tokenless exact-name path stays on Vercel. Recommended.
4. Optional: non-wormhole `identifySignature` skips the enclave.

**Also open:** the enclave write credential. Choose a simple shared secret (mirroring `CONVEX_SERVICE_SECRET`) or a second `customJwt` provider. A shared secret is lower effort and gives the same protection.

After Part 07 is agreed, apply its knock-on notes (in its verification section) to Parts 08, 09, 15, 16 and 23, then move to **Part 08: EVE login and tokens**.
