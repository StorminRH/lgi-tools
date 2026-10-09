# Part 12: Map access lists, auto-admission, blocks and their integrity

**Status:** Draft for owner review

**Carried from the Part 07 review (2026-10-09):** access-list edits and map creation stay on Vercel's readable path (`/api/maps/access`, `/api/maps/create`, Upstash 5 per minute); there is no `access` class and no sealed-service map creation. Role checks use today's `requireMapAccess` on the readable `mapAccess` row, re-checked in `complete`. There is no job inbox: affiliation and access-change work is driven by the enclave watching readable state.

## In one paragraph

Map access keeps working as it does today. Access lists, blocks and map records stay readable in Neon and are projected to Convex. Anyone on a list gets in automatically. Roles, corp grants, blocks, character-scoped maps and the lost-access screen are unchanged. One thing is new: these readable rows now decide who gets map keys. Anyone who can write to `map_access`, such as a holder of leaked Neon credentials, could otherwise admit their own character and read the map. This part recommends option (b). The sealed service accepts every access-list edit itself and signs each accepted version as a snapshot of the list. It decides membership only from that signed snapshot, its own character-link record, its own stored affiliation observations and its own token state. LGI's own removals (sale, character purge, account deletion) need no member signature. Readable state that is stricter than the snapshot applies at once. Readable state that is looser is ignored and raises an alert. This protects against data edits, not against whoever ships lgi.tools code (Parts 26 to 28).

## How it works today

- **Records.** `maps.user_id` is the creator. `map_access` holds grants of `viewer`, `editor` or `admin` to a `character` or a `corporation`. There are no alliance grants and no expiry, although 06 lists alliances; this part corrects that row. Each map and grantee pair has one row.
- **Roles.** `resolveMatchedMapRoles` always resolves the creator as admin. Otherwise it unions the roles of matching grants.
- **Who counts.** A user's principals are their linked characters that have a refresh token and no authorization failure older than 24 hours (`sharedAccessEligible`), plus those characters' stored `characters.corporation_id`. Map access never reads corp roles.
- **Editing.** `POST /api/maps/access` handles `upsert`, `revoke`, `block` and `unblock`. Any admin who is not blocked can use it (`activeMapAdminSelection`). Guards: the creator must keep one of their own characters on a character-scoped map; nobody can block their own character or the creator's. Problem codes: `map_admin_required`, `map_creator_character_required`, `map_block_owner`, `map_block_self`, and `map_projection_unavailable` (503) when the Convex projection fails after the edit commits.
- **Blocks.** `map_blocks` names a character. `map_block_accounts` records every account that has held it since the block, except the creator's. Holder rows are inserted on character link (`recordBlockedCharacterHolders`, via `enqueueAffectedMapAccessChanges`), moved on merge (`mergeMapBlocks`, which also updates `blocked_by_user_id`) and deleted on account deletion (`forgetMapBlockAccounts`). Blocked accounts get no claim.
- **Creation.** `createMapAtomic` stages the map with the creator's own characters (`creatorCharacterIds`, after the unlinked-creator-character check) as viewer grants. `projectStagedMapAccess` runs attempts at 0, 2, 5 and 10 s, each with a 2 s timeout, inside a 20 s deadline. Success runs `publishCreatedMap`; failure runs `compensateFailedMapCreation` and teardown.
- **Lifecycle.** Deleting a map archives it (`deleteMapForUser` → `archiveAuthorizedMap`); `restoreMapForUser` restores it. Archived maps project no claims. A failed projection reports `projectionPending`. Purge is `requestAuthorizedMapPurge`.
- **Projection.** Every change upserts `map_access_changes`. Vercel computes claims and posts them to Convex `/project-map-access` with a revision from a Postgres sequence; the watermark rejects stale revisions. The projection uses `principalsIgnoringStampAge`, so it keeps the last stored corp with no age limit. Edits project synchronously. Other changes drain from the outbox with a 20 s budget and a 4 s per-map delivery timeout (`DELIVERY_TIMEOUT_MS`). Vercel also writes `mapAccess` through revoke-only doors: `/purge-map-access` (teardown), `/purge-user-map-claims`, `/purge-map-chain` and `/merge-user-state`.
- **Convex gate.** `requireMapAccess` reads one `mapAccess` row by map and JWT subject, so a revocation drops live subscriptions.
- **Affiliation.** `POST /characters/affiliation/` (public). No cron refreshes it. It is refreshed on demand at login, when the map list or corp access loads, and from `/api/internal/eve-characters`. A failed fetch keeps the old row (`refreshAffiliationsWithOutcome`). Only the UI and edit path (`resolveUserCorpAccess`, `createCorpAccessSnapshot`) applies the one-hour freshness gate. `updateAffiliations` queues maps that grant the old or new corp when it sees a change.
- **Sales today.** The credential purge deletes grants naming the sold character (`purgeCharacterMapGrants`). Decision 1's notices and auto-blocks are Part 14.
- **Losing access.** `ChainLive` shows `NoMapAccess`. `RightsTransitionToast` fires when edit rights change.

Files: `src/data/maps/` (`access.ts`, `authorization-sql.ts`, `blocks.ts`, `queries.ts`, `purge.ts`, `lifecycle.ts`, `api-contract.ts`), `src/composition/map-access-projection.ts`, `map-affiliation-access.ts`, `map-creation.ts`, `map-lifecycle.ts`, `map-access-identity.ts`, `src/platform/auth/affiliation.ts`, `corp-access.ts`, `convex/http.ts`, `convex/httpMapAccess.ts`, `convex/accountMerge.ts`, `convex/lib/mapAccess.ts`, `src/app/api/maps/access/route.ts`, `src/mapper/chain/NoMapAccess.tsx`, `src/mapper/authoring/RightsTransitionToast.tsx`.

## What changes

Nothing visible changes for users. The access dialog, roles, guards, error codes, lost-access screen and rights toast stay the same. Backend only:

- Access edits and map creation become sealed `access` requests to the sealed service (Part 07), which commits them to Neon.
- The sealed service is the only writer that adds or raises Convex claims.
- Membership for key release comes from verified inputs, never from readable columns.
- Any loss of membership rotates the map key (Part 13).

## Design

### Signed access snapshot (option b)

A new readable Neon table, `map_access_state`, holds one row per map:

| Field | Meaning |
|---|---|
| `map_id`, `version` | Version starts at 1 at creation and rises by one per accepted change |
| `state` | Canonical state: creator account, character-scoped flag, sorted grants, sorted blocks with holder accounts |
| `last_change`, `actor` | Kind and subject of the latest change; editor account or `system` with a reason (`sale`, `purge`, `deletion`, `merge`, `restrict`) |
| `at`, `mac` | Timestamp; HMAC-SHA256 over all fields under an access key derived from the service root key |

Membership and the stricter-or-looser comparison are computed from this snapshot alone. There is no history table, so nothing needs pruning. Rollback protection comes from the sealed service's in-memory head and the Convex head, not from a chain. Name, lifecycle and `blocked_by_user_id` stay outside the state.

### Accepting an edit

| Step | Sealed service |
|---|---|
| 1 | Authenticates the browser session key and finds the account (Part 07) |
| 2 | Loads and verifies the snapshot; refuses one below its known head |
| 3 | Resolves the caller's role with the shared role code from `src/data/maps/access.ts` and the inputs in "Deciding membership" |
| 4 | Applies today's guards and returns today's problem codes |
| 5 | In one Neon transaction: writes the readable row change, the new signed snapshot and `map_access_changes` |
| 6 | Writes claims to Convex. If that fails after the commit, it returns `map_projection_unavailable` (503), exactly as today |

### Creation, archive and purge

- **Creation.** The sealed service runs the creation ladder itself. It checks creator characters against its own link record, then stages the map, grants, snapshot version 1 and the first key epoch (Part 13) in one step. Compensation is a `system` delete that removes the snapshot. The attempt ladder moves inside the sealed service, so the 2 s per-attempt timeout covers only the Convex write, not the relay hop.
- **Archive and restore** are lifecycle only and never change the snapshot. An archived map releases no keys or wraps. Archiving is not a membership loss and does not rotate the key. Restore re-projects the unchanged signed state.
- **Purge** (`requestAuthorizedMapPurge`) and account-deletion map removal delete the snapshot and end the map.

### Deciding membership

For a key request, a wrap, an edit check or a reconcile, the sealed service uses only:

- **Lists:** the latest valid snapshot not below its known head.
- **Characters:** its own character-link record (Part 08), never `account.user_id`. That record has a per-account monotonic version and a signed tombstone set, so a replayed old row is rejected.
- **Eligibility:** its own token state (a sealed token exists; authorization has not failed for more than 24 hours).
- **Affiliation:** its own stored observations, a MAC'd readable row per character (`character_id`, `corporation_id`, `observed_at`, `version`). These survive restarts. A failed fetch or missing data means "no change". Only an affirmative ESI answer naming a different corp removes access or rotates a key. Existing members keep access on an older observation during an outage, as today. A first wrap for an account at an epoch needs an observation under one hour old.
- **Blocks:** snapshot holders, plus whoever its link record says holds the blocked character now.

It never uses Convex claims, `characters.corporation_id` or `maps.user_id` for these decisions. Part 15's enclave role loading follows the same rule.

### Reconcile and projection

The outbox, its triggers and the Vercel drain stay. For each queued map, the drain sends a sealed-service job that names the characters whose affiliation Vercel saw change. The sealed service:

1. Re-fetches those characters from ESI, bypassing its stored observation.
2. Computes membership.
3. Writes the reduced claims to Convex first, so access fails closed as today.
4. If anyone wrapped at the current epoch is no longer admitted, rotates the key (Part 13).
5. Replies. Vercel acknowledges the outbox row only after both steps succeed.

Rotation runs as its own job with its own budget, so the 4 s per-map delivery timeout covers only the claim write. Because Vercel decides when reconciles run, the workers also re-check affiliation for current-epoch members whenever a key or wrap is requested, and hourly for maps with live members.

Projections carry `revision` and `accessVersion`. Vercel's revoke-only doors bump `revision` only. Convex refuses a sealed-service projection only on a lower `accessVersion`.

### Mismatches

| Readable state versus snapshot | Handling |
|---|---|
| Stricter: a grant missing, a role lower, an extra block or holder, a map purged | Applied at once. A `system` version signs it on the next touch. Covers the character purge, sale job and synthetic-pilot cleanup. |
| Holder row removed for a deleted account | Accepted only when custody ran the deletion and wrote a signed `system-remove` tombstone with reason `deletion`. Missing rows never imply deletion. |
| Looser: extra grant, higher role, missing block or holder, different `maps.user_id` | Ignored. The owner gets an alert. The next edit re-asserts the snapshot over the readable rows. |
| Snapshot invalid or below the known head | Decisions use the last known valid state. No key or wrap is released. Alert. |
| Convex head ahead of the signed head | Alert; re-project. |

### Database writers

| Writer today | Change | Where after |
|---|---|---|
| Edits: grant upsert, revoke, block, unblock | Any | Sealed service |
| `purgeCharacterMapGrants` (sale, purge) | Grant delete, stricter | Vercel |
| `recordBlockedCharacterHolders` on link | Holder insert | Custody, which runs login (Part 08) |
| `mergeMapBlocks` | Holder move and delete | Custody, which runs merge (Part 11) |
| `forgetMapBlockAccounts` | Holder delete, looser | Custody's deletion flow, with tombstone |
| `blocked_by_user_id` updates | Attribution only | Vercel, narrow column grant |

Vercel's Neon role loses insert and update on `map_access`, insert on `map_blocks` and `map_block_accounts`, and delete on `map_blocks` and `map_block_accounts`.

### Tracking selections

`mapTracking` stays readable. The sealed service polls a character for a map only if it admits that character there, and only for a selection made from that character's own account session (Part 17).

### Options compared

| | (a) Admins' browsers sign | (b) Sealed service signs (default) | (c) Accept the limit |
|---|---|---|---|
| Stops a database-write attacker adding a grant | Yes | Yes | No |
| Stops an operator shipping lgi.tools code | No | No | No |
| LGI's own removals | Separate unsigned path | Natural `system` versions | n/a |
| Build cost | High: browser signing keys and a key directory, which the plan dropped | One table, one MAC per edit | None |

### Risks

- An ESI outage or enclave restart could otherwise drop every corp member and rotate every key. Persistent observations and "failure means no change" prevent this.
- A replayed link row could unblock a past holder. Monotonic versions and tombstones prevent this.
- Rolling back both Neon and Convex together, plus an enclave restart, can restore an older valid snapshot. Accepted; listed in Part 28.
- Rotation under load can exceed drain timeouts. It runs as a separate job after claims are cut.
- Vercel's map list and Convex claims can disagree if their affiliation reads differ. Targeted re-fetch narrows this to seconds.

### How it is tested

Adversarial integration tests, run through `pnpm check` and `pnpm verify`:

- Insert a looser grant row: no claim, no key, alert.
- Delete a block or holder row: still blocked, alert.
- Replay a deleted link row: rejected.
- Corrupt the snapshot MAC, or lower its version: no key, alert.
- Set the Convex head ahead of the signed head: alert and re-project.
- Vercel calls `/project-map-access` with a looser claim: refused.
- ESI affiliation fails during reconcile: no claim change, no rotation.
- Archive then restore: no rotation; access returns.
- Timing: claim writes inside the 4 s drain timeout; creation attempts inside 2 s.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| `maps` (creator, name, lifecycle, `character_scoped_at`) | All | None | LGI server; creation in the sealed service |
| `map_access` grants | All | None | Edits accepted by the sealed service; stored on the LGI server |
| `map_blocks`, `map_block_accounts` | All | None | As above; holder writes in custody |
| `map_access_state` (new) | All, with MAC | None | Sealed service writes and verifies |
| `map_access_changes` outbox | All | None | LGI server |
| `characters` affiliation | All | None | LGI server for UI and names |
| Sealed service affiliation observations (new) | Yes, MAC'd | None | Sealed service |
| Character-link record (Part 08) | Yes, MAC'd, versioned | None | Sealed service |
| Convex `mapAccess` claims | All | None | Sealed service adds; Vercel revokes only |
| `mapAccessProjectionWatermarks` with `accessVersion` | All | None | Convex stores |
| `mapTracking` | All | None | Convex; sealed service checks membership |
| Per-map membership set | No | Memory only | Sealed service |
| `corp_member_roles` | All | None | Not used by map access (Part 23) |

## Hard rules

1. [Agreed] Anyone on a map's access list is admitted automatically, with no approval step or wait.
2. [Agreed] Roles, character and corp grants, blocks and character-scoped maps work as today. The creator is the one owner and always resolves as admin. There is no two-owner rule and no succession.
3. [Agreed] Leaving a granting corp removes access and rotates the map key at the next affiliation refresh, as today. Rejoining restores access. No grace period.
4. [Agreed] A sale block survives affiliation changes until removed. The README says "owner"; this part reads it as "any map admin, as today" (see Questions).
5. [Agreed] There is no new UI. Losing access shows today's `NoMapAccess` screen and rights toast.
6. [Proposed] The sealed service decides membership only from the verified snapshot, its own link record, token state and stored affiliation observations. Readable `account`, `characters`, `maps.user_id` and Convex claims never gate a key.
7. [Proposed] Member edits and map creation go only through sealed `access` requests. Only the sealed service inserts or raises grants, removes blocks or holders, and writes snapshots.
8. [Proposed] Stricter readable state applies at once. Looser readable state is ignored and raises an alert.
9. [Proposed] No key or wrap is released on an invalid snapshot or one below the known head.
10. [Proposed] Each snapshot binds the map, version, creator, scoped flag, grants and blocks with holders under an enclave-only MAC key.
11. [Proposed] A reconcile writes reduced claims first, then rotates, and the outbox row is acknowledged only after both succeed.
12. [Proposed] Only the sealed service's credential may call `/project-map-access` or add or raise claims. Vercel keeps revoke-only doors, which bump `revision` only. Convex refuses a lower `accessVersion`.
13. [Proposed] A character's location is sealed to a map only if the sealed service admits it there and the selection came from that character's own account session (Part 17).
14. [Proposed] Today's guards and problem codes, including `map_projection_unavailable`, are enforced in the sealed service using the shared role code.
15. [Proposed] Affiliation observations persist across restarts. A failed or empty fetch means no change; only an affirmative ESI answer naming a different corp removes access or rotates a key.
16. [Proposed] Account deletion is never inferred from missing rows. Deletion holder removals need custody's signed tombstone.
17. [Proposed] The character-link record has per-account monotonic versions and signed tombstones; a replayed row is rejected.
18. [Proposed] At boot the sealed service takes the higher of the Neon and Convex heads and refuses a Neon snapshot below Convex's.
19. [Proposed] Vercel's Neon grants follow the database-writers table.
20. [Proposed] Archive and restore never change the snapshot or rotate the key. Only purge or account deletion ends a map.

## Assumptions

- **Affiliation reads match.** Targeted re-fetches give Vercel and the sealed service the same answer. Check: log mismatch codes on staging for two weeks.
- **Writers are complete.** The writers table lists every writer. Check: grep writers of `mapAccess`, `mapBlocks`, `mapBlockAccounts` and Convex `mapAccess` before revoking grants.
- **Backfill done.** The character-scoping backfill (`listUnscopedMapIds`) is empty before version 1. Check: query production before Phase 2.
- **Version 1 is trusted on first use.** Each list is signed as it stands at migration (Part 31). Check: the owner reviews an export of every map's grants and blocks; it is small at 18 users.
- **The extra hop is fast enough.** Edits gain about 200 to 400 ms. Check: Part 32 timing budgets.

## What users see

Nothing new. The same dialog, roles, toasts, lost-access screen and timings within today's states. Sale notices are Part 14.

**Dropped from older docs:** strict approval, invites, no-link joins, guest links, safety numbers, the two-owner rule, succession, the Owner/Manager/Member renaming, account blocks as join filters, and the signed membership log in the Durable Object (DR-JOIN, DR-C9, DR-C11, D-MEM-*). Alliance grants and grant expiry are not current features.

## Questions for the owner

1. **Option (a), (b) or (c)?** Recommended: (b). It stops anyone with database write access, including an operator acting only through the data stores, from admitting a character. It does not stop an operator who ships lgi.tools code (Parts 26 to 28); nothing here does. It costs one table and needs no browser keys. With (c), a database write admits any character to any map.
2. **What happens on a mismatch?** Recommended: fail closed, alert, and re-assert the snapshot on the next edit. Alternatives: freeze the map's list until the owner acts, or alert only.
3. **Who fetches affiliation?** Recommended: both, with the sealed service re-fetching the characters each reconcile names. Alternative: the workers become the single fetcher and write MAC'd affiliation that Vercel reads. That removes divergence but puts login and map-list refreshes behind the sealed service.
4. **Keep access history?** Recommended: no; keep only the signed snapshot, as today has no access history. Alternative: keep 7 days of change rows, which adds metadata that does not exist today.
5. **Who may remove a sale block?** Recommended: any map admin, as today, reading the README's "owner" that way. Alternative: only the creator.
