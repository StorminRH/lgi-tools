# Part 11: Account lifecycle: link, unlink, merge, transfer and deletion

**Status:** Draft for owner review

**Carried from the Part 07 review (2026-10-09):** there are no session-key registrations; revocation is deleting the Neon session row, which the enclave sees within its 60 s cache, and its "session not found" reply sends the browser down today's signed-out path. There are no awaited jobs, so `merge.confirm` cannot wait on one: rework it to ride the next sealed request or to be read by the enclave from readable merge state.

## In one paragraph

Every lifecycle flow keeps the steps, rules and screens it has today. Readable rows still move or are deleted by the same rules. Rows under a user key name their key by `keyId`, not the readable owner, so a readable rekey never stops them opening. After the sealed service confirms a merge in Neon, the survivor gets the merged account's user key as a second key, every backup the survivor then holds is re-sealed to cover its whole key set, and rows re-seal when next written. Account deletion destroys the account's user key records (a crypto-shred), final once the Neon history window has passed. Admin reassign stops carrying tokens and data, a change only the admin sees. Character sales are Part 14.

## How it works today

- **Link.** `proveCharacter` finishes any pending deletion, then `classifyProof` picks noop, backfill, refuse-unverified, transfer (Part 14) or merge. When the `ownerHash` column is empty, it decrypts the stored access token on Vercel (`storedTokenOwnerHash`) to get the hash. The `account.create.after` hook reprojects map access, resets tracking and revalues net worth.
- **Unlink** (refused for the last character) revokes map claims through the character, deletes the `account` row and tokens (`unlinkAccount`), erases every `net_worth_days` row whose `pilots` contains the pilot, resets tracking and revalues. No CCP revoke. Character-keyed ESI rows stay and follow the character (`follows-character`).
- **Purge character** records a `pending_deletions` receipt, revokes at CCP (best-effort), runs every purge contributor and deletes the link.
- **Delete account** purges each link, runs the user purge (owned maps purged at once) and deletes `user`. Housekeeping retries. Merges are refused during a pending deletion.
- **Merge.** A login proves a character, same owner hash, on another account. The older account survives (`pickSurvivor`). One Neon transaction applies each contributor's rule (`rekey`, `survivor-wins`, `follows-character`, `discard`, custom), rekeys sessions, snapshots tracking and deletes the source, logging `auth_merge`. Convex settles best-effort afterwards.
- **Biomass.** No specific code. Two `invalid_grant` strikes set `authorizationSuspended` (the reconnect state).
- **Session revoke.** "Log out everywhere" and admin revoke delete `session` rows; the production cookie cache (`maxAge: 300`) lags up to 5 minutes.
- **Admin reassign** moves the `account` row, tokens included, to the acting admin, then reprojects map access for both accounts; data follows. **Admin unlink** is user unlink without CCP revoke.

Files: `src/composition/account-lifecycle/` (`account-merge.ts`, `account-purge.ts`, `owner-transfer.ts`, `tracking-merge-retry.ts`); `src/platform/auth/` (`purge.ts`, `admin-users.ts`, `owner-reconcile.ts`, `authorization-store.ts`, `auth.ts`); `src/platform/purge/merge.ts`; `src/composition/map-access-identity.ts`; `src/features/*/purge.ts`; `src/app/api/account/characters/unlink/route.ts`; `src/app/api/admin/characters/reassign/route.ts`; `convex/accountMerge.ts`.

## What changes

Nothing visible changes for users: same buttons, confirmations, redirects, timings and error states. The changes are backend only, except admin reassign, which only the admin sees (owner question 3).

## Design

### Flow by flow

| Flow | Readable steps (LGI server) | Sealed-service steps |
|---|---|---|
| Link | As today, minus the `tokenOwnerHash` fallback and `backfill` branch; Part 31 backfills `account.ownerHash` once in the sealed service | Custody writes the link record (Part 08) and decides refuse-unverified from it. A new owner hash is a sale (Part 14) |
| Unlink, admin unlink, purge, transfer | As today, but first send custody the removal and wait for its acknowledgement (Part 08's revoke order). If custody is unreachable, proceed | Link record and sealed token deleted; best-effort CCP revoke where it runs today. Unsigned (Part 12) |
| Delete account | As today, plus delete the account's `sealed_key_records` of kind `user` and `user_key_backups` (Part 10) | The enclave deletes the user's Convex `mapKeyWraps`, drops in-memory keys and deletes registrations |
| Merge | `mergeUsers` and the Convex settle, unchanged except a `rekey` rule for `user_key_backups` | See below |
| Session revoke | As today | Registrations deleted and refused at once (Part 07). A "registration revoked" reply makes the browser run today's signed-out path: clear keys, redirect as at expiry, no new copy |
| Admin reassign (if kept) | Row moves without tokens; `authorizationSuspended = true`, so the reconnect state shows; target reprojection waits for the character's EVE login there | Sealed token and views deleted, never re-sealed to the admin. Part 12's looser-state alert skips reassign |
| Biomass | As today | Nothing new |

Custody never acts on a link record whose Neon `account` row is gone. A missing row only denies service, so this covers a lost acknowledgement.

### Merge mechanics

1. **Decide.** At a verified login, custody finds the proven character, same owner hash, on another account in its link record, and Neon still holds that `account` row. It picks the survivor as `pickSurvivor` does and stores a pending merge, readable and MAC'd, expiring after 24 hours. The login reply carries only the logged-in account's keys.
2. **Readable merge.** Vercel's `classifyProof` must also return merge; `mergeUsers` runs unchanged.
3. **Confirm.** Vercel then sends `merge.confirm` (deduplicated on the source ID) and waits before redirecting; on a timeout the next sealed request carries it. Custody checks that the source `user` row is gone and its characters sit on the chosen survivor. A mismatch changes nothing and logs a code.
4. **Attach.** Custody re-wraps the source user key as an extra record for the survivor (next free epoch), moves link records, and moves the registrations it holds for the source, from its own records. Workers rebuild the survivor's views and per-viewer corp results (Parts 19, 23) before success is reported. Every browser registered to the survivor, including signed-in ones, gets the whole keyring on its next sealed request.
5. **Map key wraps.** The enclave deletes source wraps and wraps the survivor at once for each map it can open (Part 10).
6. **Backups.** `user_key_backups` has a `user_id` column, so `mergeUsers` needs a rule for it; it uses `rekey`, moving only the readable `user_id`. The source's passkeys and recovery key keep working: each row gains a readable `bound_user_id`, set at enrolment and never changed, and Part 10's HKDF info, `wrapped_private` AAD and `sealed_user_key` info bind it instead of `user_id`. During attach, before success is reported, the sealed service re-seals `sealed_user_key` on every row the survivor now holds, its own and the moved ones, to the survivor's whole keyring (each key with its `keyId`); this needs only each row's public key. Any backup enrolled later also seals the whole keyring. A restore after permanent loss (Part 10) then returns every key the account's rows were sealed under, and the enclave checks each key against a sealed document under its own `keyId`. Part 10's caps apply only at enrolment: after a merge the card lists every moved backup, and creating a new recovery key replaces all recovery rows. If neither account had backups, nothing changes.
7. **Lazy re-seal.** A row re-seals under the survivor's newest key when next written; older rows open by `keyId`. Key records are destroyed only at account deletion.

Rows moved by `rekey` or kept by `survivor-wins` open as soon as the merge commits. `pending_tracking_merges` stays, minus `lastProcessedTransitionAt` (Part 02). The alternative (owner question 1) is an eager re-seal, then destroying the source key after a full pass: more moving parts, and a bug strands rows under a destroyed key.

### AAD, raw ESI documents and net worth

- **AAD.** Part 09 binds user-authored documents, `favoriteBlueprints`, net-worth days, views and map key wraps to `userId`, which `rekey` changes. Instead, rows under a user key bind label, table, row ID, version and `keyId`; the key record says whose key it is. EVE tokens bind the character ID and `account.id`.
- **Raw ESI documents.** Browsers read views, not raw assets, blueprints, skills, sheet or jobs (Part 19). Seal those under an enclave-only key, like the corp and token keys. Link, unlink, merge and reassign then need no document re-seal; rows follow the character as today.
- **Net-worth erasure.** Add readable `pilot_ids integer[]` to `net_worth_days`, so the erase filters in Neon as today. It reveals only which linked characters counted each day. Part 22 owns the table.

### Deletion and backups

Destroying the key records makes leftover user-key rows and wraps useless. An operator could restore a copy from Neon history, so the shred is final only after that window. Owned maps are purged as today with their map keys (Part 13).

### Dropped, risks and tests

- **Dropped** (01; 04 D-LIFE-3 to D-LIFE-5): keyring and compromise merges, sigchain revokes, deletion blocks for sole owners, browser-side CCP revoke, `signalUnknownCredential`, the recovery-kit checklist, key-directory and biomass tombstones, the 7-day contestable reset.
- **Risks:** a faked readable merge (custody needs its own decision plus Neon's commit); a key record revived from Neon history (accepted until the window passes, Part 28); one extra key per merge (accepted).
- **Tests:** extend `account-merge.db.test.ts` and `account-purge.db.test.ts`. On the dev sealed service: merge with a second survivor browser open, then every row opens and board totals match today's; drop an unlink acknowledgement, re-link on a new account, and no source key is released; rekey a Neon `session` row to another user and nothing new is released; a revoked browser lands on the normal signed-out page without error toasts; merge two accounts that each have a backup, simulate permanent loss, and restoring from either backup opens rows sealed under both keys. No Vercel login path reads `account.accessToken`; no erase path decrypts; smoke journeys pass unchanged (Part 32).

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| `user`, `session`, `verification` | All, as today | None | LGI server |
| `account` | IDs, scope, owner hash, authorization counters | Tokens (token key) | Sealed service seals; LGI server deletes |
| `pending_deletions`, `pending_tracking_merges`, receipts | All (jump time removed) | None | LGI server |
| Character-link record, pending merge | Yes, MAC'd; written only by custody | None | Sealed service |
| `sealed_key_records` (user, including merged keys) | Metadata | Key bytes | Sealed service creates; LGI purge may delete |
| `user_key_backups` | As Part 10, plus `bound_user_id`; merge rekeys `user_id` | `wrapped_private`; `sealed_user_key` (whole keyring) | Sealed service re-seals at merge; LGI server rekeys and deletes |
| Raw ESI documents | Versions, ETags | Content (enclave-only key) | Sealed service |
| `net_worth_days` | `userId`, `day`, counts, new `pilot_ids` | `netWorth`, `liquidIsk`, `pilots` | LGI server erases; sealed service values |

## Hard rules

1. [Agreed] Lifecycle flows look and behave as today, with no new prompts or copy (principle 1). Exception: admin reassign, seen only by the admin.
2. [Agreed] Unlink, purge and transfer remove data as today, including every net-worth day that counted the pilot.
3. [Agreed] Logging in with EVE reaches all of the account's data, merged accounts included (decision 5).
4. [Proposed] Only custody writes link records, pending merges and user key records, after a verified EVE login.
5. [Proposed] Custody releases a source key only after confirming Neon committed its merge, never on a pending merge alone, and acts on a link record only while Neon holds that `account` row.
6. [Proposed] An unconfirmed pending merge expires after 24 hours.
7. [Proposed] Custody moves only registrations it holds for the source, driven by its own pending merge. It never reads Neon `session.userId` to decide whose key a browser gets.
8. [Proposed] Every browser registered to the survivor gets the whole keyring; views are rebuilt before the merge reports success.
9. [Proposed, amends Part 09] User-key rows bind `keyId`, not `userId`, in AAD; tokens bind character ID and `account.id`.
10. [Proposed, amends Part 08] Removals wait for custody's acknowledgement before deleting the `account` row, and proceed if custody is unreachable.
11. [Proposed, amends Parts 09 and 18] Raw per-owner ESI documents are sealed under an enclave-only key.
12. [Proposed] No Vercel path reads `account.accessToken`; `classifyProof` loses the stored-token fallback.
13. [Proposed, amends Part 09 rule 8] LGI's purge may delete `sealed_key_records` of kind `user`. The enclave deletes Convex `mapKeyWraps`.
14. [Proposed, amends Part 13] Unlink and account deletion count as removal for map-key rotation.
15. [Proposed, amends Part 07] Revoked registrations are refused at once; the browser then runs today's signed-out path.
16. [Proposed] Admin actions never move sealed data or tokens. A kept reassign sets `authorizationSuspended`, defers reprojection and skips Part 12's alert.
17. [Proposed] Removals are accepted from LGI unsigned; additions and moves need custody's own evidence.
18. [Proposed] Lifecycle jobs are idempotent and serialized per owner, with errors as codes only. CCP revoke stays best-effort.
19. [Proposed] `net_worth_days` gains readable `pilot_ids`; no erase path decrypts.
20. [Proposed, amends Part 10] Every backup an account holds seals its whole keyring. A merge rekeys `user_key_backups.user_id` (the only LGI write to that table besides deletion), and backups bind the unchanging `bound_user_id`; custody re-seals the survivor's backups to the merged keyring before the merge reports success.

## Assumptions

- **Merges and reassigns are rare.** Count `auth_merge` and `admin_character_reassign` telemetry.
- **Rebuilding views at confirm takes seconds.** Time the largest account on the dev sealed service.
- **No browser opens raw ESI documents.** Check Part 19's routes.
- **The Neon history window is short.** Read it in the Neon console; record it in Part 25.
- **Convex backups are kept no longer than Neon history.** Check the Convex dashboard.

## What users see

Nothing new. Merges, unlinks, purges, deletion and "log out everywhere" look and time the same. If reassign is kept, the admin sees a moved character in today's reconnect state until it logs in.

## Questions for the owner

1. **Merge: keyring with lazy re-seal, or eager re-seal and destroy the source key?** Recommend the keyring.
2. **Raw ESI documents under an enclave-only key?** Recommend yes, amending Parts 09 and 18.
3. **Admin reassign: remove, metadata only, or keep moving data?** Recommend removing it if telemetry shows little use, otherwise metadata only. Moving data lets an operator's account read a user's data.
4. **Should deletion crypto-shred?** Recommend yes, final after the Neon history window.
5. **Map key wraps at merge: at once, or on first open?** Recommend at once, so outage unlocks work.
6. **AAD: `keyId` for user-key rows, character and `account.id` for tokens?** Recommend yes, amending Part 09.
7. **Neon history window: plan default or shorter?** Recommend the shortest acceptable for restores, recorded in Part 25.
