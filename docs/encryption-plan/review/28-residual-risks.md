# Part 28: Residual risks and adversarial review

**Status:** Draft for owner review

## In one paragraph

This part tests the design against concrete attacks. For each it says what happens, how the owner finds out, and whether it is stopped or accepted. It shows what rejecting Part 12's access-list signing would cost. It replaces 01's accepted-risk list with a shorter one for the sealed-service design, and sets the checklist every phase must pass before promotion: the security-review and code-review skills at the highest level, plus adversarial tests in CI. There are no paid audits, formal models or relay simulator.

## How it works today

- Operators can read tokens and content today. Tokens sit under one environment key (`EVE_TOKEN_ENCRYPTION_KEY`), and plaintext access-token leases sit in Convex. `map_access` rows can be edited directly. The login owner-hash check (`classifyProof`) reads rows an operator could change. Admin reassign moves a character's `account` row, tokens included, to the acting admin; admin unlink deletes it. The CSP allows `'unsafe-inline'`.
- Account settings shows an active-session count and a "Log out everywhere" action (`/api/account/sessions/revoke`). There is no per-session list.
- Reviews today: `pnpm check` before every commit and `pnpm verify` before promote or release. Every Fallow finding must be fixed, with no suppressions or raised thresholds. Promote and release PRs go through two review rounds. Round 1 runs `/poteto-mode` and `/thermos`. On promote, round 2 triages the CodeRabbit, Greptile and Cursor Bugbot reviews requested after round 1. On release, round 2 runs `/poteto-mode` and `/thermos` again and no bots are requested. Coverage health runs on PR pushes touching code, schema, lockfile or config (`src/`, `convex/`, `scripts/`, `e2e/`, `drizzle/`, root configs, `package.json`, `pnpm-lock.yaml`, its workflow files). The full Verify workflow is started by hand.
- The old list (01 "Pressure-test findings" and "Residual risks the owner accepts", 04 §26) assumes the browser-first design and is superseded.

Files: `AGENTS.md`, `package.json` (`check`, `verify`, `fallow:*`), `.claude/skills/promote/SKILL.md`, `.claude/skills/release/SKILL.md`, `.github/workflows/test.yml`, `.github/workflows/coverage-health.yml`, `src/platform/auth/token-crypto.ts`, `src/platform/auth/admin-users.ts`, `src/app/api/admin/characters/reassign/route.ts`, `src/app/(site)/settings/account/page.tsx`, `convex/characterLocationAccess.ts`, `src/app/api/internal/eve-token/route.ts`, `src/platform/auth/owner-reconcile.ts`, `src/data/maps/access.ts`, `src/mapper/chain/NoMapAccess.tsx`, `src/proxy.ts`.

## What changes

Nothing visible changes for users. This part adds a risk register in repo docs, adversarial tests and a review gate per phase.

## Design

### Attacks walked

"Operator" means anyone with write access to Vercel, Convex, Neon or the parent instance, but not to the enclave's memory. The operator can stop and restart the enclave at will, and every enclave release restarts it.

Integrity alerts also go from the enclave straight to Discord (hard rule 14). A malicious operator can still block that at the parent or delete stored copies, so marked alerts mainly catch faults and outsiders with stolen credentials.

| # | Attack | Outcome | Detection | Status |
|---|---|---|---|---|
| 1 | Operator adds a grant to `map_access` for their own character | No key or wrap is released. Decisions use only the signed access snapshot (Part 12). | Looser-than-snapshot alert (suppressible) | Mitigated |
| 2 | Operator edits `account.ownerHash` or `account.user_id` to take over a character | Ignored. Custody uses its own link record and the JWT's owner hash (Part 08). | Mismatch alert (suppressible) | Mitigated |
| 3 | Operator edits `characters.corporation_id`, `corp_member_roles` or the `corp_structure_sharing` mirror | Ignored. The sealed service reads affiliation and roles from ESI itself (Parts 12, 23). An edited or untagged sharing row counts as off. Replaying an earlier tagged "on" row gives current members today's sharing-on grant (Part 23). | Tag-failure alert (suppressible); replay unseen | Mitigated; replay accepted |
| 4 | Operator rolls the access snapshot back to an earlier valid version | Refused while the enclave runs (in-memory head). The operator can force a restart, so the real bar is rolling back Neon and Convex together. Impact: removed characters are re-admitted and sale blocks undone (decision 1), so a buyer could reach the map. | Boot alert with adopted heads; a restart outside a release stands out (suppressible) | Accepted |
| 5 | Swapping a sealed row into another table, map, row or epoch, or editing it | Fails to open. AAD binds table, map, row key, version, key ID and epoch (Parts 09, 16). | Opening fails, alert | Mitigated |
| 6 | Replaying an older version of the same row with its readable version, rolling back a whole map, or deleting rows | Caught by head digests only while the enclave holds a newer head in memory (Part 16). Deleted tombstones or events lose undo or log entries. A rollback of the map and its head plus a forced restart goes unnoticed. | Head mismatch alert; boot alert (both suppressible) | Reduced |
| 7 | Operator forges an identity assertion by swapping Vercel's pinned key | Gets a session: metadata and ciphertext only. Keys and access edits need a browser session key registered at a real EVE login (Parts 07, 08). | Sessions without a matching enclave login | Mitigated for content |
| 8 | Operator swaps the enclave's Convex credential key and writes sealed rows | Can write junk, replay old ciphertext or delete. Cannot forge content without map keys. | Rows fail to open; head mismatch | Reduced (availability lost) |
| 9 | Parent instance or network drops, delays or reorders traffic | Denial of service only. TLS and sealed requests end inside the enclave. | Health heartbeat (Part 29) | Accepted (availability) |
| 10 | AWS account owner changes the KMS policy or runs an unpublished image | Browsers refuse an unpublished fingerprint, but an image that only unseals stored data never meets a browser | CloudTrail alert and drift check (Part 06), both controlled by that same person unless the check is public (question 4) | Accepted, detectable |
| 11 | Whoever serves lgi.tools ships browser code that leaks keys or plaintext after login | Every key and all content the user can see in that session is exposed | Not detected in practice. Only someone inspecting the exact code served to them could see it, and a build targeted at one user would go unseen. | Accepted |
| 12 | XSS or a malicious extension | Can use unlocked keys as an oracle within the session. A strict CSP and Trusted Types narrow it (Part 26). | None reliable | Reduced |
| 13 | Stolen browser profile | In the session, today's stolen-cookie reach. Expiry or revoke ends Convex and sealed-service access, but the copied `lgi-keys` store keeps the user key and cached map epochs (Part 09). With any ciphertext obtained later (downloaded rows, a database leak) it decrypts personal documents and every map epoch wrapped to that user key, until the user key changes. Today's cookie gives nothing after expiry. | Active-session count and "Log out everywhere" on Account settings | Accepted (decision 7; question 6) |
| 14 | Database or backup theft | Metadata readable (Part 03); content needs the KMS-bound root key. Old plaintext and deleted key records survive in Neon history and Convex backups until they age out (Parts 11, 31). | None | Mitigated after the window |
| 15 | Bug in worker code (one image, Part 05) | Remote code execution exposes every key and all cached plaintext | Hard to detect | Reduced, accepted |
| 16 | Someone holds a user's EVE login | Full reach to that user's data | None | Accepted (decision 5) |
| 17 | Dev sealed service or its attestation stand-in reaches production | Release builds refuse it (Parts 25, 27) | Build assertion | Mitigated |
| 18 | Operator restores an older valid character-link record, pointing a sold or unlinked character back at their former account | A rolled-back record cannot pair with a newer token, so nothing is synced, polled or sealed under the wrong user key (hard rule 15). Rolling back both stores plus a forced restart remains. | Boot alert; mismatch alert (both suppressible) | Reduced |
| 19 | Admin reassigns or unlinks a victim's character to their own account | Metadata only. Custody updates the link record by removal only and moves no token or sealed data (Part 08 rule 14, Part 11 rule 16); link records are written only after a verified EVE login (Part 11 rule 4). | `admin_character_reassign` event | Mitigated |

### Cost of rejecting Part 12's default

Under option (c), row 1 becomes a full breach of any map. An operator adds a grant, the next reconcile wraps the current key epoch to their character, and decision 3 hands over earlier epochs too: the 7-day history and live tracking. Nothing shows and no alert fires. Rows 2 and 3 fail the same way. Option (b) costs one readable table and one MAC per edit. Option (a) needs long-lived browser signing keys, which the plan dropped.

### Limits on worker code

With one image (Part 05), these rules shrink what a bug can reach (hard rules 7, 8 and 11):

- Custody gives workers no general decrypt or unwrap call, only a key handle for a map, owner or corp after it has checked the request (Fallow zone boundary).
- Every external input (ESI bodies, Convex rows, sealed requests) is schema-parsed, with property tests.
- Enclave dependencies are pinned; a new one needs a review note. No `eval` or dynamic import.

### Accepted-risk list (replaces 01's list)

1. Whoever holds a user's EVE login reaches their data (decision 5).
2. Whoever serves lgi.tools could ship code that leaks keys after login. This is not prevented, and in practice not detected: only someone inspecting the exact code served to them could see it, and a build targeted at one user would go unseen.
3. AWS signs the attestation, and the AWS account owner can change the key-release rule. A change that serves users shows in the published fingerprints; an offline unseal shows only in CloudTrail and the drift check.
4. XSS and extensions can use unlocked keys within a session (decision 7). A copied browser profile keeps the user key and cached map key epochs after expiry and revoke, for any ciphertext the holder later obtains.
5. A worker bug runs beside every key (one image).
6. Rolling back the stores plus a restart, which the operator can force at will, goes unnoticed except through the boot alert (rows 4, 6, 18). An access rollback can undo removals and sale blocks. Deleting tombstones, events or bookkeeping loses undo or log entries.
7. Operators can deny service and read all metadata in Part 03, including timing and sizes.
8. Plaintext survives in Neon history and Convex backups until they age out after migration.
9. Members keep what they saw. Removal protects only new data.
10. If the sealed key records are destroyed, map metadata (names, access lists, roles, blocks) survives. Map contents survive only where some member has a passkey or recovery key; otherwise the map reopens empty. Users without either also lose their personal documents. This narrows decision 9's "maps survive with other members" and is pending the owner's sign-off (Part 10 question 5).
11. While the sealed service is down, logins, edits, tracking and syncs pause (Part 05). New logins fail even for users with a passkey; backups help only sessions that are still valid (pending the owner's answer to Part 08 question 6).
12. If the owner ships Part 08's manual break-glass release, a Vercel code exchange returns, re-opening server-side token exposure while it is deployed.

### Review checklist for each phase

Each phase (Part 30) passes these before promotion to staging:

| Item | How |
|---|---|
| Security review | `security-review` skill over the phase diff; each finding fixed, or registered under hard rule 10 |
| Code review | The `code-review` skill at `max` over the phase diff, findings fixed |
| Adversarial tests | Every attack row the phase touches that hard rule 9 covers has a test that passes in Coverage health against the dev sealed service |
| Staging drill | KMS or attestation phases: a forged fingerprint is refused; a policy change and a scheduled deletion each alert |
| Plaintext check | No content or tokens in logs, error fields, caches or telemetry (Part 31) |
| Users notice nothing | Part 01's checks pass unchanged |
| Gates | `pnpm verify` green with zero Fallow findings; the existing promote or release rounds run as today |
| Register | This part's tables are updated for the phase |

Adversarial tests by phase: Phase 0, leases gone and logs scrubbed; Phase 1, rows 2, 7, 10, 13, 17, 18 and 19; Phase 2, rows 1, 4, 5, 6 and 8; Phase 3, replayed and swapped personal documents; Phase 4, rows 3 and 19 and Part 23's role and sharing cases; Phase 5, row 14.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| Risk register and review results | Yes (repo docs) | No | n/a |
| Alert codes, boot alerts and mismatch events | Yes | No | Sealed service emits to the stores and to Discord; LGI server stores |
| Access snapshot (`map_access_state`) | Yes, with MAC | No | Sealed service signs and checks |
| Character-link record versions and heads | Yes, with MAC | No | Sealed service |
| Map head digests and versions | Versions yes; digest sealed (Part 16) | Digest, map key | Sealed service only; browsers do not check |
| CloudTrail events | AWS account | No | AWS |

## Hard rules

1. [Fixed: brief scale constraint] No paid audits. Assurance comes from agent reviews and tests.
2. [Agreed] No in-app messaging about risks or encryption (decision 2). The register lives in repo docs.
3. [Fixed: AGENTS.md] Every Fallow finding is fixed, with no suppressions, baselines or raised thresholds.
4. [Proposed] Each phase passes the checklist above before promotion.
5. [Proposed] Fail closed only for the affected map, document or link record, and only for that one operation. A bad MAC, a sealed row that fails to open, or an access snapshot or link record below the in-memory head refuses that key release or edit and raises an alert code. A Convex head behind Neon is lag and only re-projects. A map head digest mismatch alerts and keeps serving (Part 16 question 6). Never block login, other maps or other documents. Users see today's generic error states, never `NoMapAccess`, which stays for real removals.
6. [Proposed] Alerts and logs carry codes, never content or IDs from content.
7. [Proposed] Custody exposes no general decrypt or unwrap call to worker code.
8. [Proposed] All external input to the enclave is schema-parsed, with property tests on the parsers.
9. [Proposed] Every attack row marked Mitigated or Reduced has an automated test or a named staging drill. Rows 12 and 15 are tested where their defences live: Part 26's CSP tests and rules 7, 8 and 11. Accepted rows need none.
10. [Proposed] Adding an accepted risk, or registering a security finding instead of fixing it, needs the owner's sign-off in the PR that does it.
11. [Proposed] Enclave dependencies are pinned, and a new one needs a review note in its PR. No `eval`, `new Function` or dynamic import in enclave code.
12. [Proposed] Any PR that touches custody or `src/lib/seal/` gets the `security-review` skill before it merges to development (question 5).
13. [Proposed] Coverage health starts the dev sealed service, so adversarial tests run on every qualifying PR push (Part 32).
14. [Proposed] The enclave sends integrity alert codes, and a boot alert naming the heads it adopted, straight to the Discord alert webhook over its own TLS, as well as writing them to the stores. This adds the webhook host to Part 05's allowlist and an "Integrity alert codes" row to Part 29's monitoring table.
15. [Proposed] Every sealed token and worker output binds the character-link record's accountId and version in its AAD. The enclave keeps link-record heads in memory and at boot refuses a Neon version below Convex's.

## Assumptions

| Assumption | How to check |
|---|---|
| Nitro isolates enclave memory from the parent instance | Taken on trust (AWS) |
| CloudTrail-to-email alerts arrive within minutes | Staging drill (Part 06) |
| Copied IndexedDB keys work in another browser profile | Test on the owner's machine; row 13 assumes they do |
| The dev sealed service runs the same custody code paths | A shared module check in Part 32 |
| Agent reviews catch these bug classes | Seed a known flaw on a branch; see if the review finds it |

## What users see

Nothing new. Integrity failures show today's generic error states for the one affected map or document. The lost-access screen appears only for real removals.

## Questions for the owner

1. **Part 12 option (b)?** *Recommended:* yes. Option (c) makes row 1 a silent breach of a whole map.
2. **One image, with worker bugs beside the keys?** *Recommended:* accept for now. Revisit if users grow well past 18 or a corp asks.
3. **Accept coordinated rollback with a forced restart (rows 4, 6 and 18)?** *Recommended:* accept, with the boot alert. Closing it needs a store the operator cannot roll back, and there is none at this cost.
4. **Make the KMS drift check public?** *Recommended:* yes. Run it in the public repo's Actions and log the live policy hash, so a policy change shows publicly. It is self-reported, but disabling it leaves a visible gap.
5. **Review cadence?** *Recommended:* per phase at `max`, plus the security review on any PR that touches custody or `src/lib/seal/` (hard rule 12).
6. **Stolen profiles keep keys (row 13)?** Option A: accept, as worded. Option B: persist only the browser session key and fetch the user-key wrap from the sealed service on each page load, so expiry or revoke ends key use. *Recommended:* A. B adds a sealed-service round trip to every page load and stops existing sessions during an outage, which Part 08 keeps working.
