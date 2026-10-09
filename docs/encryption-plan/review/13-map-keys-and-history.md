# Part 13: Map keys, rotation, history and map lifecycle

**Status:** Draft for owner review

**Carried from the Part 07 review (2026-10-09):** epoch 0 is created lazily at a map's first sealed write, not in the creation step (creation stays on Vercel). Key wraps and rotation are driven by the enclave watching the readable `mapAccess` projection; there is no job inbox.

## In one paragraph

Each map gets a map key, created and held by the sealed service, in numbered key epochs. Epoch 0 is made with the map, or by the migration for existing maps. Whenever an account becomes eligible for a map, the sealed service writes it a wrap of the map key under its user key, without waiting for a browser. When an account that was eligible during the current epoch loses access (removed from the list, blocked, left a granting corp, unlinked or deleted), the sealed service starts a new epoch at once. It then re-seals the map's rows under the new epoch in the background and retires the old one. Everyone currently on the map, new joiners included, can read the event log and use the 24-hour undo, exactly as today (decision 3). Archive, the 30-day trash, restore and purge work as today. Every purge path also destroys the map's wraps and key records. Users see nothing new.

## How it works today

- Map rows are plaintext in Convex. There are no keys.
- `writeMapEvent` stores each event with `purgeAfter = at + MAP_EVENT_RETENTION_MS` (7 days). The daily `map chain purge` cron deletes events by the `by_purge_after` index, and removed connections and systems after the 24-hour undo window (`MAP_CHAIN_UNDO_WINDOW_MS`).
- `watchMapEvents` returns the latest 100 events (`MAP_EVENT_READ_LIMIT`) to anyone with view access, so a joiner sees the same capped log as every member. The log offers undo on removal events younger than 24 hours to editors (`mapEventRestorable`).
- Access is the projected claim in Convex `mapAccess`, built from Neon's cached affiliations (`principalsIgnoringStampAge`). `watchMapAccess` returns `granted`, `canEdit` and `trackableCharacterIds` (the characters tracking may use on a character-scoped map). When `granted` turns false, `ChainLive` renders `NoMapAccess` ("You've lost access to this map o7"). When `canEdit` flips, `RightsTransitionToast` shows "Edit access restored" or "View-only access".
- Delete (admin) archives the map; the projection returns no claims for an archived map, so every member loses access. Restore (admin) works within `MAP_DELETE_GRACE_MS` (30 days). Purge-now is creator-only and queues the map.
- The daily batch runs `cron:purge-maps` (`purgeEligibleMaps`): it claims due maps, calls `purgeMapChain`, which runs `purgeMapBatch` over `MAP_PURGE_TABLES` in 128-row batches, tears down the projection and tombstones the map. Purge-now waits for this batch.
- Account deletion is different. `purgeUser` calls `purgeOwnedMapChainsThenDeleteMaps`, and `teardownProjectionsForDeletedUser` (run before the user row is deleted, also when the last character is unlinked) calls `purgeMapChain` for each owned map straight away. Owned maps then go by `db.delete(maps)`, with no archive, trash, claim, `purge_claimed_at` or tombstone. The synthetic pilot reset also calls `purgeMapChain` directly.
- Merges are live: `mergeMapBlocks` moves block holders to the survivor, and `convex/accountMerge.ts` settles Convex afterwards.

Files: `src/data/maps/{chain-events,chain-contract,lifecycle,lifecycle-contract,purge}.ts`, `src/composition/{map-lifecycle,map-purge,map-access-projection,map-access-identity,synthetic-pilot-store}.ts`, `src/platform/auth/{account-purge,deletion-jobs}.ts`, `src/app/api/cron/purge-maps/declaration.ts`, `src/app/api/maps/{delete,restore,purge-now}/route.ts`, `convex/{mapAuthoringEvents,mapChainEvents,mapChainCleanup,mapChainAccess,mapPurge,accountMerge,crons}.ts`, `src/mapper/chain/{ChainLive,NoMapAccess}.tsx`, `src/mapper/authoring/RightsTransitionToast.tsx`, `src/mapper/log/map-event-copy.ts`.

## What changes

Nothing visible changes for users. Behind today's screens, map rows are sealed under a map key epoch, keys rotate on loss of access, and every purge path destroys wraps and keys as well as rows. One limit is new and stated under What users see: an account admitted during a sealed-service outage cannot read the map until the service is back.

## Design

### Epochs and wraps

| Item | Rule |
|---|---|
| Epoch 0 | Made in Part 12's creation step with the map. For existing maps, made by the Part 31 migration job before any sealed or location row is written |
| Key record | One `sealed_key_records` row per (map, epoch), kind `map` (Part 09). Its readable times record creation and retirement |
| Current epoch | A readable `currentEpoch` on `mapHeads` (Part 16), switched in the same mutation as the new wraps. No separate epoch table |
| Proactive wraps | After each reconcile job (Part 12) and at creation (Part 12), the enclave writes wraps for every newly eligible account, for the current epoch and every retained epoch |
| Fallback | If a browser finds no wrap, it sends a silent `mapKeys.request` (Part 09); the enclave checks access (Part 12) and writes the missing wraps |
| Row tag | Every sealed map and location row carries a readable `keyEpoch` with a `by_map_epoch` index, so the sweep can find leftovers (row shapes: Part 16) |

### Rotation

The trigger is Part 12's reconcile job. Convex does not enqueue rotation. The outbox and the Vercel drain stay as today, and for each queued map the drain sends the sealed service a reconcile job. The enclave computes verified eligibility (Part 12) and writes the reduced claims first. Then, as a separate job with its own budget, so that the drain's 4 s per-map timeout covers only the claim write, it runs the rotation check. The workers' own affiliation re-checks (on a key or wrap request, and hourly for maps with live members, Part 12) feed the same check. If any account that was verified-eligible at some point during the current epoch, taken from Part 12's signed access chain plus the enclave's own affiliation checks, is no longer eligible, and the map is not archived, it rotates. There is no separate holder list to protect against rollback. Over-rotating is cheap at 18 users.

| Event | Rotates? | Why |
|---|---|---|
| Removed from the access list | Yes | Loss of access |
| Block | Yes if the blocked account was eligible this epoch; a sale block normally does not | A sale block records only the buyer's account, which never held a key (Part 14). The seller's account rotates only if the unlink ends its access (unlink row) |
| Left a granting corp (decision 6) | Yes | Loss of access; rejoining restores it through the grant |
| Unlink or account deletion that ends access (Part 11) | Yes | Loss of access |
| Merge (Part 11) | No | The same person keeps access. Part 11's `merge.reseal` job counts the source's eligibility as the survivor's and writes survivor wraps before the source user key is destroyed |
| Editor becomes viewer, or the reverse | No | Viewers read with the same key; edits are checked by role (Part 15) |
| Character-scoped map loses one of an account's characters, account keeps access | No | Keys are per account (Part 09). `trackableCharacterIds` changes as today |
| Archive | No | Claims return on restore; the check runs at restore |
| Restore | Only if an account lost access while archived | Same check |

Rotation steps, under the per-map write lock (Part 05):

1. Make epoch N+1 and its key record.
2. In one Convex mutation, set `mapHeads.currentEpoch` to N+1, write N+1 wraps for every continuing eligible account, and delete all wraps of accounts that lost access. Continuing members get the new key before any row uses it, including members who are offline.
3. Every later write, location rows included (Part 17), uses N+1.
4. Drop the map's plaintext cache entry for N and reload under N+1 (Part 05).

During an outage, Convex already hides the rows from the removed account, as today. Rotation then runs on recovery, before the first new edit.

### Re-seal and epoch retention

After step 4, a background sweep re-seals every row of the map still tagged with an old epoch: live rows, tombstoned rows still inside the undo window, `mapEvents` and location rows. Each batch is a normal Part 16 commit under the per-map lock. It compare-and-sets each row's version, skips rows already at N+1 or with a newer version, and updates `mapHeads.mapVersion` and the head digest in the same mutation. Location rows are swept the same way, or skipped once their next poll write has moved them to N+1. The sweep resumes after a restart. Maps nobody has open are rotated and swept the same way; the enclave needs no browser.

When `by_map_epoch` shows no rows under epoch N, the enclave marks it retired. It deletes epoch N's key record and wraps 24 hours later. That margin covers browsers that still hold rows from just before the sweep. An epoch still referenced by any row is never destroyed.

Decision 3 says current members' apps pass the old keys along. This part replaces that mechanism: the enclave re-seals rows and writes wraps for retained epochs (principle 3). The outcome decision 3 asks for is unchanged. The log and every undoable tombstone end up under the current epoch, readable by everyone on the map. A joiner during a sweep gets every retained epoch. Undo runs in the workers (Option 1, Part 15), which hold every epoch, so its 24-hour window is unchanged. Under Option 2, browsers get the same retained epochs through the proactive wraps.

### When access ends in the browser

`watchMapAccess` returns `granted: false` as today, and `ChainLive` shows `NoMapAccess`. The crypto worker also drops that map's cached key epochs and decrypted state (Part 09 storage rules). A `canEdit` change shows today's toast and touches no keys. If a row arrives under an epoch the browser has no key for yet, it keeps showing the last decrypted state and fetches the wrap silently. There is no spinner and no new copy.

The projection and the enclave can disagree, because the enclave uses its own ESI fetch, its own link record and Part 12's chain check. A refused wrap while `granted` is true is handled by the refusal's reason:

- **Not admitted** (no grant, blocked, or the enclave's affiliation check says the account is out). The browser retries silently up to three times over about 30 seconds, then shows today's `NoMapAccess`. The refusal also queues the map for Part 12's reconcile job, which re-projects it, so Convex comes to match the enclave's verdict and `granted` turns false through today's path.
- **Integrity refusal** (a broken access-list chain, an access snapshot or link record below the enclave's head, a bad MAC or a sealed row that fails to open). The enclave releases no key and raises an alert code (Part 28 rule 5). The browser shows today's map `unavailable` state (Part 29), never `NoMapAccess`, which stays for real removals. Only that map is affected. A Convex head that is merely behind Neon is lag, not an integrity refusal: it re-projects and is treated as above.

### Map lifecycle

| Step | Today | Added |
|---|---|---|
| Delete (archive), admin | Lifecycle `archived`; claims removed | Enclave evicts the plaintext cache and refuses edits and wraps. Keys and wraps are kept for the 30-day trash |
| Restore, admin, within 30 days | Lifecycle `active`; claims return | Rotation check |
| Purge (daily batch, purge-now) | `purgeEligibleMaps`: claim, `purgeMapChain`, tear down projection, tombstone | Shred step before `purgeMapChain` |
| Account deletion, last-character unlink | `purgeOwnedMapChainsThenDeleteMaps` and `teardownProjectionsForDeletedUser`: `purgeMapChain`, then delete `maps` | Same shred step before each `purgeMapChain` |
| Synthetic pilot reset | `purgeMapChain` per owned map | Same shred step |

The shred step, in order:

1. Delete every `mapKeyWraps` row for the map through a dedicated Convex call, repeating until none remain. `mapKeyWraps` has a `by_map` index and is also listed first in `MAP_PURGE_TABLES` as a backstop.
2. Delete every `sealed_key_records` row of kind `map` for the map, all epochs.
3. Only then call `purgeMapChain` for the content tables.

Rows a partial purge leaves become unreadable once the key records and all wraps are gone. Copies of the key records in Neon history (Part 11) and copies of the wraps in Convex backups stay openable by the enclave until those windows pass (Part 28). LGI's purge role may delete kind `map` key records, so purges never wait on the enclave: a narrow amendment to Part 09 rule 6, like Part 11's for kind `user`. Idle maps are never deleted, as today.

### Dropped from the older design

Manager-only history keys; browsers passing old keys along (decision 3's stated mechanism, replaced as above); the 30-day op log and revert-by-character; signed membership logs and system revokes; confirm tags; rotation leases and forced snapshots; the 30-day rotation timer; guest projection keys; suspension with pinned re-admission (decision 6); the archive notice and export prompt; the purge-now veto; the 365-day idle warning.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| Map key bytes, each epoch | No | Yes (service root key) | Sealed service |
| `sealed_key_records` metadata (kind `map`, subject, epoch, times) | Yes | No | Sealed service writes; LGI server deletes at purge |
| `mapHeads.currentEpoch` | Yes | No | Sealed service writes; LGI server stores and purges |
| `mapKeyWraps` (`mapId`, `userId`, epoch, `keyId`) | Yes | Wrapped key | Sealed service wraps; browser unwraps |
| Row `keyEpoch` tag on sealed map and location rows | Yes | No | Sealed service writes; LGI server indexes |
| `mapEvents.at`, `kind`, `actor`, `purgeAfter` | Yes | No | LGI server purges by `purgeAfter` |
| `mapEvents.payload` | No | Yes (map key) | Sealed service writes; browser decrypts |
| `maps` lifecycle fields | Yes | No | LGI server (unchanged) |
| Rotation count and timing | Yes | No | Shows membership churn, already visible in access lists |

## Hard rules

1. [Agreed] History matches today: 7-day event log (latest 100 shown), 24-hour undo, readable by everyone currently on the map, new joiners included. No history limited to managers (decision 3).
2. [Agreed] Leaving a granting corp removes access and rotates the map key at once. Rejoining restores access through the grant, with no grace or suspension state (decision 6).
3. [Agreed] A sale block stays until an owner removes it (decisions 1 and 6).
4. [Agreed] One owner and today's roles (decision 8); today's archive, restore, purge-now, purge and account-deletion behaviour (principle 1).
5. [Agreed] No new UI. Loss of access shows `NoMapAccess`; role changes show today's toast (principle 1).
6. [Proposed] Map keys are made and held only by the sealed service. They leave it only as wraps under members' user keys (Part 09).
7. [Proposed] Rotation fires when any account verified-eligible during the current epoch (Part 12 chain plus the enclave's own affiliation checks) stops being eligible, unless the map is archived. The check runs in Part 12's reconcile job, sent by the Vercel drain, after the reduced claims are written, and on the workers' own affiliation re-checks; Convex does not enqueue it. Nothing else rotates. A sale rotates only if the seller's account loses access through the unlink; the buyer's account never held a key. A merge does not rotate.
8. [Proposed] Wraps for continuing members are written in the same Convex mutation that switches `mapHeads.currentEpoch`, before any row uses it. Wraps of accounts that lost access are deleted in that mutation.
9. [Proposed] No new edit is accepted under epoch N once an account eligible during N has become ineligible; rotation runs first, including on recovery from an outage.
10. [Proposed] Every active map has a current epoch before any sealed row or location row is written for it (creation per Part 12, existing maps per Part 31).
11. [Proposed] The enclave writes wraps for every newly eligible account, for the current and every retained epoch, as soon as access is granted. `mapKeys.request` is only a silent fallback.
12. [Proposed] The enclave seals only under the current epoch, never reuses an epoch number, and never issues a wrap to an ineligible account or for an archived or tombstoned map. It refuses edits on archived maps.
13. [Proposed] Archive keeps the map's keys and wraps for the whole 30-day trash.
14. [Proposed] Rotation, re-seal batches and wrap writes for a map run under its per-map lock (Part 05).
15. [Proposed] Every sealed map and location row carries a readable `keyEpoch`. Each re-seal batch is a normal Part 16 commit: it compare-and-sets each row's version, skips rows already at N+1 or newer, and updates `mapHeads.mapVersion` and the head digest in the same mutation. The sweep is idempotent and resumable.
16. [Proposed] An epoch is destroyed 24 hours after no row references it, never earlier.
17. [Proposed] The browser drops a map's keys and plaintext when `granted` turns false, and shows no loading state while fetching a new epoch. A wrap refused as not admitted gets bounded silent retries, then today's `NoMapAccess`, and queues the map for Part 12's reconcile job. A wrap refused on integrity shows today's map `unavailable` state, never `NoMapAccess` (Parts 28 and 29).
18. [Proposed] Every caller of `purgeMapChain` (`purgeEligibleMaps`, `purgeOwnedMapChainsThenDeleteMaps`, `teardownProjectionsForDeletedUser`, the synthetic pilot reset) first deletes all `mapKeyWraps` for the map until none remain, then its key records, then calls `purgeMapChain`. LGI's purge role may delete kind `map` records only for maps that are `purge_claimed`, or owned by an account being deleted (`user.deletionRequestedAt` set, or its last character being removed), or owned by the synthetic pilot.
19. [Proposed] Retention values come only from `MAP_EVENT_RETENTION_MS`, `MAP_CHAIN_UNDO_WINDOW_MS`, `MAP_DELETE_GRACE_MS` and `MAP_EVENT_READ_LIMIT`. No copies.

## Assumptions

| Assumption | How to check |
|---|---|
| Maps re-seal in seconds; rotation completes within 30 seconds of the reconcile's claim write while the service is up | Count Convex rows per map in production, `mapEvents` included; assert the 30-second target in a forced-rotation test |
| Re-sealed rows cause no flicker | Mapper smoke journeys against the dev sealed service with a forced rotation (Part 32) |
| Rotations are rare at 18 users | Rate of pending access changes and affiliation changes in Neon over 30 days |
| Archive empties claims, so no wraps are issued while archived | Verified: `computeMapAccessClaimsForState` returns `[]` for archived maps |
| Purge-now waits for the daily batch; account deletion does not | Verified: only `cron:purge-maps` calls `purgeEligibleMaps`; `purgeUser` and `teardownProjectionsForDeletedUser` call `purgeMapChain` directly |
| One Convex mutation can hold the epoch switch and all wraps | Largest member count times wrap size against Convex mutation limits |
| Projection and enclave verdicts rarely disagree | Count reconcile jobs in staging; a test forces a not-admitted mismatch and expects `NoMapAccess` after the retries; a test breaks the access chain and expects the map `unavailable` state, never `NoMapAccess` |

Tests: a db test for each shred path (daily purge, account deletion, last-character unlink, synthetic reset) checks that wraps and key records are gone before any content row is deleted; a test that a re-seal batch loses to a newer location write; a merge test that the survivor has wraps before the source user key is destroyed.

## What users see

Nothing new. Losing access shows today's screen, and role changes show today's toast. Rotation, re-seal and key destruction are invisible. One limit: an account admitted while the sealed service is down (including someone who just rejoined a granting corp) cannot read the map until the service is back, because no wrap can be written for it. Members who already hold wraps keep working (Part 10). If the enclave refuses a wrap that the projection allowed because the account is not admitted, the user sees today's `NoMapAccess` after a short silent retry. If it refuses on integrity, the user sees today's map `unavailable` state instead.

## Questions for the owner

1. **Re-seal policy.** Eager background re-seal of every row; live rows only, letting history expire; or on next write only, keeping old epochs while any row uses them, possibly forever. Recommended: eager, every row. Old epochs then live minutes, and decision 3's outcome holds without browsers passing old keys along, as the README describes.
2. **Epoch retention.** Destroy 24 hours after no row uses it; 7 days after rotation; or at purge. Recommended: 24 hours after no row uses it.
3. **Maps nobody opens.** Rotate and re-seal at once, or wait for the next open. Recommended: at once, as decision 6 says; no browser is needed.
4. **When wraps are written.** At once for every eligible account (at grant and at rotation), or on each one's next open. Recommended: at once, so every member admitted before an outage can read during it (Part 10), with no extra round trip on first open.
5. **Who deletes map key records at purge.** LGI's purge role, or the sealed service. Recommended: LGI's purge role, so purges and account deletions never wait on the enclave.
