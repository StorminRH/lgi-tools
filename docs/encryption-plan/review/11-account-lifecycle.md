# Part 11: Account lifecycle: link, unlink, merge, transfer and deletion

**Status:** Draft for owner review

## In one paragraph

Every lifecycle flow keeps the steps, rules and screens it has today. This part adds what sealing needs. Rows that today move or are deleted by readable keys still move or are deleted the same way. A merge also re-seals the merged account's data under the survivor's user key, then destroys the merged account's user key. Account deletion also deletes the user key record (a crypto-shred), so leftover copies in rows, Neon history and Convex backups become unreadable. That holds once the history window has passed. Admin reassign becomes metadata only. Character sales are Part 14.

## How it works today

- **Link.** Login runs `proveCharacter`: it finishes any pending deletion for the character, then `classifyProof` picks noop, backfill, refuse, transfer (sale, Part 14) or merge. The `account.create.after` hook reprojects map access, resets tracking and revalues net worth.
- **Unlink** (Settings, Characters; refused for the last character). It revokes map claims granted through the character, deletes the `account` row and tokens via Better Auth `unlinkAccount`, erases every `net_worth_days` row whose `pilots` JSON contains the pilot, resets tracking and revalues. Nothing is revoked at CCP. Character-keyed ESI rows (assets, blueprints, skills, sheet, jobs) stay, so re-linking shows them.
- **Purge character** (danger zone). It sets `account.deletionRequestedAt`, inserts a `pending_deletions` receipt (one per user), revokes the refresh token at CCP (best-effort), runs every purge contributor (credential, cache, durable) and deletes the link. The last character takes the account with it, and the browser goes to CCP's authorized-apps page.
- **Delete account.** It sets `user.deletionRequestedAt`, purges each link as above, runs the user purge (owned maps purged at once; blocks stay with the blocker cleared) and deletes `user`. Housekeeping retries unfinished requests 20 at a time. Merges are refused while either account has a pending deletion.
- **Merge.** A login proves a character, with a matching owner hash, that sits on another account. The older account survives (`pickSurvivor`). One Neon transaction locks both users and applies each contributor's rule (`rekey`, `survivor-wins` by key for `net_worth_days` and `user_preferences`, `follows-character`, `discard`, custom), snapshots tracking into `pending_tracking_merges` and deletes the source. Its sessions are rekeyed to the survivor. Convex settles best-effort afterwards; housekeeping retries tracking merges, and receipts are kept 90 days.
- **Biomassed characters.** There is no specific code. Refresh fails, and two `invalid_grant` strikes 5 minutes apart suspend authorization (the reconnect state). The data stays until the user unlinks or purges.
- **Session revocation.** "Log out everywhere" and the admin revoke both delete every `session` row. The production cookie cache can lag by up to 5 minutes. Sessions last 7 days, and expired rows are pruned after 1 day.
- **Admin reassign** moves a character's `account` row, tokens included, to the acting admin's own account; its data follows. **Admin unlink** works like user unlink, with no CCP revoke and no data purge.

Files: `src/composition/account-lifecycle/` (`account-merge.ts`, `account-purge.ts`, `character-transfer.ts`, `owner-transfer.ts`, `tracking-merge-retry.ts`, `tracking-receipt-retention.ts`); `src/platform/auth/` (`deletion-jobs.ts`, `deletion-schema.ts`, `purge.ts`, `account-purge.ts`, `admin-users.ts`, `owner-reconcile.ts`, `eve-token-service.ts`, `auth.ts`); `src/composition/map-access-identity.ts`; `src/features/net-worth/schema.ts`, `purge.ts`; `src/app/api/account/` and `src/app/api/admin/` (character and session routes); `convex/accountMerge.ts`, `convex/httpAccountMerge.ts`.

## What changes

Nothing visible changes for users: same buttons, confirmations, redirects, timings and error states. Backend only: merges re-seal under the survivor's user key; deletion destroys the user key record; the character-link record (Part 08) follows every link change; net-worth erasure gets readable pilot IDs because `pilots` becomes sealed; admin reassign stops carrying tokens and data.

## Design

### Flow by flow

| Flow | Readable steps (LGI server) | Sealed-service steps |
|---|---|---|
| Link | As today | Custody writes the link record at the verified login (Part 08). If the character's documents are still under another account's user key with the same owner hash (unlinked from A, re-linked on B), custody re-seals them to the new account, as rows follow the character today. A different owner hash is a sale (Part 14). |
| Unlink, admin unlink | As today, including the net-worth erase | A doorbell job deletes the link record and sealed token. Documents stay under the user key, as rows stay today. Removals need no browser signature (Part 12). |
| Purge character | As today | Best-effort CCP revoke (Part 08); link record deleted. Documents are deleted as rows; no key needed. |
| Delete account | As today, plus delete `sealed_key_records` rows of kind `user` for this account, `user_key_backups` (Part 10) and the user's Convex `mapKeyWraps` | Best-effort revokes; the enclave drops its in-memory copy of the user key and the session-key registrations. |
| Merge | `mergeUsers` and the Convex settle, as today | See below |
| Session revoke (own or admin) | As today | Session-key registrations deleted (Part 07); the enclave refuses them at once, ahead of the 5-minute cookie-cache lag. |
| Admin reassign | The `account` row moves as today | Metadata only: the sealed token and documents are deleted, never re-sealed to the admin. The character shows today's reconnect state until it logs in with EVE on the target account; data then re-downloads. |
| Biomass | As today | Nothing new. Sealed data stays until unlink or purge. |

### Merge mechanics

1. **Decide.** At a verified login, custody finds the proven character, same owner hash, on another account in its own link record. It picks the survivor by account age, as `pickSurvivor` does, and records a pending merge.
2. **Release.** The reply wraps both user keys to the new browser session key; whoever holds this EVE login owns both accounts (decision 5). Envelope `keyId`s say which key opens which row.
3. **Readable merge.** Vercel runs `mergeUsers` and `settleConvexAfterMerge` unchanged.
4. **Confirm.** A `merge.reseal` job (deduplicated on the source ID) checks Neon: the source `user` row is gone and its characters sit on the step 1 survivor. On a mismatch it changes nothing sealed and logs a code. An uncommitted pending merge expires after 24 hours.
5. **Re-seal**, idempotent, resumable and under the per-owner locks (Part 05), every row still under the source key:

| Item | Action |
|---|---|
| Link records | Moved to the survivor first, so new syncs seal under the survivor's key |
| Per-owner documents (character owners) | Re-sealed under the survivor's user key; owner in AAD unchanged |
| Custom structures, profiles | Re-sealed with the survivor as owner, following `rekey` |
| `favoriteBlueprints`, `net_worth_days` | Re-sealed where the source row survived `survivor-wins`; the rest is already deleted |
| Precomputed views, per-viewer corp results (Parts 19, 23) | Rebuilt for the survivor in the same job, before the shred |
| Map key wraps | Source wraps deleted; the survivor is wrapped at once for each map it can open, so outage unlocks still reach them (Part 10) |
| Session-key registrations | Moved, as sessions are rekeyed today; each moved browser gets the survivor's key on its next sealed request, so nobody is logged out |
| Location rows, jump bookkeeping, corp documents | No change: keyed by map and character, or under corp keys |

6. **Shred.** Delete the source user key record and `user_key_backups`. Until then, survivor logins also get the source key.

`pending_tracking_merges`, its retries and 90-day receipts stay as today, minus `lastProcessedTransitionAt` (Part 02).

### Token AAD

Part 09 binds an EVE token to `userId`, which `rekey` changes. Bind it to the character ID and `account.id` instead; both survive a rekey, so merges need no token re-seal.

### Net-worth erasure

Add a readable `pilot_ids integer[]` to `net_worth_days`, so `eraseNetWorthHistoryForCharacter` filters in Neon as it does today with `pilots ? id`. It reveals only which linked characters counted each day; links are already readable. Part 22 owns the table.

### Deletion and backups

Destroying the user key record makes every copy of the account's sealed rows useless: rows a failed purge left behind, documents of previously unlinked characters, and map key wraps. A copy of the key record survives in Neon history until the window passes, and an operator could restore it and have the enclave open it, so the shred is final only after that window. Convex backups hold only sealed rows and wraps, useless without the record. Owned maps are purged as today with their map keys (Part 13). Deletion and unlink count as removal for Part 13's rotation triggers.

### Dropped, risks and tests

- **Dropped** (01; 04 D-LIFE-3 to D-LIFE-5): keyring merges and compromise merges, sigchain revokes, deletion blocks for sole owners or Directors, browser-side CCP revoke, `signalUnknownCredential`, the recovery-kit checklist, staggered system revokes, key-directory and biomass tombstones, and the 7-day contestable reset.
- **Risks:** a re-seal bug could leave rows under a destroyed key (the shred waits for a full verified pass); an operator could fake a readable merge (the enclave re-seals only on its own decision); a restore from Neon history could revive a deleted key record (accepted until the window passes, Part 28).
- **Tests:** real-Postgres tests extending `account-merge.db.test.ts` and `account-purge.db.test.ts` for re-seal, resume, mismatch and shred; a dev-sealed-service test that a merged browser opens every row; a test that no erase path decrypts; today's lifecycle smoke journeys unchanged (Part 32).

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| `user`, `session`, `verification` | All, as today | None | LGI server |
| `account` | IDs, scope, owner hash, authorization counters, `deletionRequestedAt` | Tokens (token key) | Sealed service seals; LGI server deletes |
| `pending_deletions`, `pending_tracking_merges`, merge receipts | All (jump time removed) | None | LGI server |
| Character-link record | Yes, MAC'd | None | Sealed service only |
| Pending merge state | No | Yes | Sealed service |
| `sealed_key_records` (user) | Metadata | Key bytes | Sealed service creates; LGI purge may delete |
| `net_worth_days` | `userId`, `day`, counts, `recordedAt`, new `pilot_ids` | `netWorth`, `liquidIsk`, `pilots` | LGI server erases; sealed service values |
| Merge re-seal | Job row and dedupe key | Rows re-sealed | Sealed service |

## Hard rules

1. [Agreed] Lifecycle flows look and behave as today: no new prompts, warnings, checklists or copy (principle 1).
2. [Agreed] Unlink, purge and transfer remove data as today, including every net-worth day that counted the pilot.
3. [Agreed] Logging in with EVE reaches all of the account's data, merged accounts included (decision 5).
4. [Proposed] Only custody writes link records, pending merges and new user keys, and only after a verified EVE login. A user key is created only at such a login.
5. [Proposed] A merge re-seals only after the enclave confirms that the readable merge matches its own decision. The source key is destroyed only after the re-seal completes.
6. [Proposed] Re-seal and erase jobs are idempotent, resumable and serialized per owner, with errors as codes only. Revoke at CCP stays best-effort (Part 08).
7. [Proposed] Account deletion deletes the user key record, the backup wraps and the map key wraps. LGI's purge role may delete `sealed_key_records` rows of kind `user`, a narrow amendment to Part 09 rule 6.
8. [Proposed] Admin actions never move sealed data or tokens to another account. Reassign is metadata only.
9. [Proposed] Removals (unlink, purge, deletion, session revoke) are accepted from LGI unsigned. Additions and moves need the enclave's own evidence.
10. [Proposed] `net_worth_days` gains readable `pilot_ids`. No erase path decrypts days.

## Assumptions

- **A merged account re-seals in seconds (a few hundred small rows).** Time the largest real account on the dev sealed service.
- **Moving session-key registrations fits Better Auth's session rekey.** Test that a second browser stays signed in after a merge.
- **The Neon history window is short.** It is not set in code; read it in the Neon console and record it in Part 25.
- **Convex backups are not kept longer than Neon history.** Check the Convex dashboard.
- **Admin reassign is rare.** Count `admin_character_reassign` telemetry events.

## What users see

Nothing new. Merges, unlinks, purges, deletion and "log out everywhere" look and time the same. Only the admin sees a difference: a character moved by reassign shows today's reconnect state until it logs in.

## Questions for the owner

1. **Merge mechanics: re-seal in the background with both keys released until it finishes (proposed), or block the login until it completes?** Recommend background with both keys released.
2. **Should deletion crypto-shred?** Recommend yes, and accept that it is final only after the Neon history window.
3. **Admin reassign: metadata only, remove it, or keep it moving data?** Recommend metadata only. Moving data would let an operator's account read a user's data.
4. **Map key wraps at merge: wrap the survivor at once, or lazily on first open?** Recommend at once, so outage unlocks keep working.
5. **Token AAD: bind to character and `account.id` instead of `userId`?** Recommend yes, amending Part 09.
6. **Neon history window: keep the plan default or shorten it?** Recommend the shortest the owner accepts for operational restores, recorded in Part 25.
