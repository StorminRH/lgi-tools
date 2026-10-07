# Part 14: Character sales: detection, auto-blocks and notices

**Status:** Draft for owner review

## In one paragraph

When a character is sold, its EVE owner hash changes. Today LGI spots this when the buyer logs in, then removes the seller's link and the character's map grants. This part moves the check into the sealed service, which compares the login's owner hash with its own character-link record before it releases any key. It then adds decision 1's three automatic steps, with no prompts: it removes the character from every access list naming it and tells each map owner; it blocks the character on every map it could still reach through a granted corp, unless the buying account was already on that map; and it gives the corp a heads-up. Owners re-admit the buyer by removing the block, as today. The only new UI is the notices, shown as one existing-style toast until dismissed, plus an optional reason line in the block list (Question 3).

## How it works today

- **Detection.** `getUserInfo` verifies the EVE JWT and calls `proveCharacter`, which runs `classifyProof`. It compares the JWT's `owner` with `account.ownerHash`, or with the claim in the stored token when the column is empty. A mismatch is `transfer`.
- **Transfer.** `transferCharacter` queues a `transfer` job in `pending_deletions` and runs `finishCharacterTransfer` inline in the login. It revokes the character's Convex map claims, then runs `runPurge(..., ['credential'])` only. That strips the tokens without a CCP revoke and deletes every `map_access` grant naming the character. It then deletes the link, erases net-worth days that included the pilot, reconciles identity, reprojects and revalues. Cache-tier rows keyed by character survive and the buyer sees them at once: owned assets (`ownedAssets.ownerId = characterId`), skill queue, character sheet, industry jobs, owned blueprints, corp roles, online status, refresh jobs and the `characters` profile.
- **No blocks, no notices.** Nothing blocks the buyer on corp-granted maps. Nobody is told.
- **Refresh failure.** Two `invalid_grant` replies, or failures older than 24 hours, end `sharedAccessEligible`, so the character's grants admit no one. No sale is inferred.
- **Blocks.** Admins block under "Blocked pilots" (`MapBlockList`) in the "Manage {mapName}" dialog. `map_blocks` is unique on (map, character); `map_block_accounts` records holders. `getBlockedMapUserIds` keeps off every recorded holder plus whichever account holds the character now, so a block covers the holder's whole account. `mergeMapBlocks` moves holder rows to a merge survivor. Blocked users see `NoMapAccess`.
- **Toasts.** `Toaster` (sonner) shows up to three toasts. There is no stored notice.

Files: `src/platform/auth/{auth,owner-reconcile,authorization-store,affiliation-store,purge,eve-token-service}.ts`, `src/composition/account-lifecycle/{owner-transfer,character-transfer}.ts`, `src/composition/purge/registry.test.ts`, `src/data/maps/{blocks,purge,schema,queries}.ts`, `src/features/maps/{MapBlockList,MapAccessDialog}.tsx`, `src/mapper/chain/NoMapAccess.tsx`, `src/components/ui/toast.tsx`.

## What changes

- Custody decides the sale from its own character-link record (Part 08), not `account.ownerHash`.
- New: sale blocks, notices to map owners, a corp heads-up and a stored notice list.
- Unchanged: the transfer job and order, the credential-only purge, refresh-failure handling, manual blocks, the lost-access screen. Cache-tier data still passes to the buyer, now re-sealed under the buyer's user key.

## Design

### Detection

Custody runs `classifyProof` against its link record before it signs the identity assertion or wraps any key. The assertion carries `decision: transfer` and the prior account. Vercel follows it and logs `owner_hash_column_mismatch` if `account.ownerHash` disagrees. Refresh failure stays as today, inside custody (Part 08), and is never a sale.

### The sale job, in order

The steps extend today's `transfer` job, stay durable and resumable, and are idempotent on (characterId, new owner hash).

| # | Who | Step |
|---|---|---|
| 1 | Custody | Records the sale in its link record: detaches the character from the prior account, keeps the new owner hash. |
| 2 | Vercel and custody | Today's `finishCharacterTransfer`, unchanged. Custody deletes the sealed tokens, with no CCP revoke, as today. Each grant deletion is a `system` chain entry with reason `sale` (Part 12). |
| 3 | Custody | Plans blocks and recipients. It reads the character's corp from ESI (`POST /characters/affiliation/`) and selects live maps whose verified chain grants that corp. It records the creator of every selected map as a heads-up recipient, then skips maps the buying account created or already reached through another character or grant (`linkingUserId`, present only on a link to an existing account). For each remaining map it inserts `map_blocks` with `ON CONFLICT DO NOTHING` (`blocked_by_user_id` null, new readable `reason = 'sale'`) plus a `system` chain entry, and queues reconcile. It computes notice recipients now, before the buyer is linked. |
| 4 | LGI server | Writes the notices. May finish after the login. |
| 5 | Custody | Signs the assertion. Better Auth links the buyer; custody records the link and adds a buyer holder row, signed `system-holder`, on each block of this character from step 3. |
| 6 | Workers | Re-seal the character's cache-tier documents and views under the buyer's user key, as Part 11 does for re-links. Durable-tier rows are untouched. |
| 7 | Custody | Reconciles each map. The key rotates only if an account holding a wrap lost access (Part 13). |

Steps 1 to 3 finish before the assertion leaves custody, so no buyer is linked, projected or wrapped ahead of a block. If ESI fails, custody uses its last affiliation read; the after-login refresh re-runs step 3, which only adds blocks.

### Lasting rules for sale blocks

- **Decision 6 exception.** A sale block survives corp changes until an admin unblocks, the map is purged, or the Part 12 chain unblocks it.
- **Scope.** Maps reachable through the corp at detection. A later granting corp admits the buyer like anyone (decision 1).
- **Never the seller.** No holder row names the seller or their other characters.
- **Merges.** Before `mergeMapBlocks` moves a sale block (reason `sale`, no blocker) onto a survivor, custody checks the survivor. If it already had chain-verified access to that map, custody removes the sale block with a `system` chain entry. Manual blocks merge as today.
- **Key release.** Custody refuses keys to anyone its sale record and the chain say is blocked, whatever readable rows say, and alerts if a block row goes missing (Part 12).

### Notices

New readable Neon table `account_notices`: `id`, `user_id` (recipient), `kind` (`sale_list_removal` or `sale_corp_heads_up`), `character_id`, `corporation_id` (names from public data), `map_ids`, `created_at`, `dismissed_at`.

| Recipient | Text (draft) |
|---|---|
| Creator of each map whose list named the character | "Character sale detected: [name] has been removed from your map's access list." Lists the maps. |
| Creator of each map that got a sale block | "[name] in [corp] changed owners and was blocked on [map]. Unblock under Blocked pilots in Manage [map] to re-admit." |
| Creators of every live map granting the corp, taken in step 3 before the skip, whether or not the map got a block | "A character in [corp], [name], changed owners. [corp] is granted on [map]." |
| Accounts with a character in the corp, directors included | "A character in [corp], [name], changed owners." |

The buying and prior accounts are excluded everywhere (Question 2). Others get one notice per sale, merged across roles.

Delivery: the session payload carries an undismissed-notice count; the client fetches notices only when it is non-zero. They show as one sonner toast with no timeout and a Dismiss action, holding at most one of the three slots.

Purge: a new contributor claims `account_notices`. User purge deletes the recipient's notices; character purge leaves them, since a notice belongs to its recipient. The merge rule is `survivor-wins` on (`kind`, `character_id`). A daily cron deletes notices per Question 1.

### Re-admission

Unblock works as today through Part 12's signed path; the corp grant readmits at the next reconcile. With Question 3, sale-created rows show "Blocked after a character sale".

### Dropped from older docs

Sale handling through the sigchain and key directory, strict approval of re-admission, and owner prompts on detection.

### Risks

- **Existing-member lockout.** Closed by step 3's skip and the merge check; tests must prove it.
- **False sales.** A mis-seeded link record would strip a real owner. Part 31 reports seed disagreements first.
- **Notice spam or hidden toasts.** One merged toast and one notice per sale.

### How it is tested

- `owner-transfer.db.test.ts`: sale blocks, recipients excluding buyer and seller, cache rows reaching the buyer, ESI fallback.
- `blocks.db.test.ts`: buyer-already-member skip, merge onto a member, manual-block collision keeping its blocker and reason.
- `registry.test.ts`: add `account_notices` to the expected list; `pnpm check` stays green.
- Adversarial: an operator deletes a sale-block row and custody still refuses keys and alerts.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| `account.ownerHash` | Yes, informational | No | LGI server, from the assertion |
| Character-link record, sale record | Yes, MAC'd (Part 08) | No | Sealed service |
| Sold character's EVE tokens | No | Sealed, then deleted | Sealed service |
| Sold character's cache-tier documents | No | Re-sealed seller to buyer | Sealed service |
| `map_access` removals, `map_access_versions` | Yes | No | Sealed service signs; LGI server applies |
| `map_blocks` (plus `reason`), `map_block_accounts` | Yes | No | Sealed service |
| Affiliation used for blocks | Cached in `characters` | No | Sealed service reads ESI |
| `account_notices` | Yes | No | LGI server; toast in browser |
| Net-worth days erased for the pilot | Today's rule | Sealed (Part 22) | Sealed service |

## Hard rules

1. [Agreed] No prompts; sale handling runs automatically on detection (decision 1).
2. [Agreed] Detection happens at login, before any key is released.
3. [Proposed] Custody's link record decides the sale; readable columns never do. A disagreement logs `owner_hash_column_mismatch`.
4. [Agreed] The seller's link, tokens and grants are removed as today: credential purge only, no CCP revoke.
5. [Proposed] Cache-tier documents pass to the buyer, re-sealed under the buyer's user key (Question 7).
6. [Agreed] The character leaves every access list naming it, and each map owner is notified.
7. [Agreed] A character still in a granting corp is blocked; the block records only the buyer's account.
8. [Proposed] No sale block on maps the buying account created or already reached; a merge onto such an account removes it (Question 6).
9. [Proposed] Blocks are written after the seller is unlinked and before any buyer link, projection or wrap.
10. [Proposed] Sale inserts never overwrite an existing block; the buyer's holder row is still added.
11. [Agreed] A sale block survives affiliation changes until an owner removes it (decisions 1 and 6).
12. [Agreed] The corp's directors, members using LGI, and owners of granting maps get a heads-up.
13. [Proposed] Recipients are computed before the buyer is linked; buying and prior accounts get nothing; one notice per account per sale.
14. [Proposed] Only map creators get owner notices (Question 4).
15. [Proposed] On ESI failure custody uses its last affiliation read; the after-login refresh re-runs step 3.
16. [Proposed] Every step is idempotent on (characterId, new owner hash) and resumable via `pending_deletions`.
17. [Proposed] Custody refuses keys on a sale block in its record and the chain, even if the readable row is gone.
18. [Proposed] Refresh failure alone is never a sale.
19. [Proposed] Notices name character and corp, never the seller. Logs carry codes, not IDs (Part 29).
20. [Proposed] `account_notices` purge: user purge deletes, character purge keeps, merge `survivor-wins` on (`kind`, `character_id`); retention per Question 1.
21. [Proposed] Notices load only when the session count is non-zero, as one merged toast.
22. [Agreed] The sale notices are the only required new UI (decision 1, decision 2 notes).
23. [Proposed] The sale-block reason line, only if Question 3 is approved.

## Assumptions

| Assumption | How to check |
|---|---|
| CCP changes the owner hash on every transfer and kills refresh tokens, so today's `invalid_grant` path covers refresh after a sale | CCP SSO docs; existing `owner-transfer` tests |
| The seeded link record matches true owners | Part 31 seeds from column and token claims, reports differences |
| Detection needs the buyer's login; until then refresh failure stops the grants | `sharedAccessEligible` in `affiliation-store.ts` |
| The ESI affiliation fetch fits today's login time | Time it on the dev sealed service |
| Sales are rare at 18 users | Count past `transfer` jobs |

## What users see

- Buyer: nothing new. With no prior access to a blocked map, today's `NoMapAccess`. Existing maps stay. Character pages fill at once, as today.
- Seller: nothing new, and no sale notice.
- Map owners, corp members, directors: one sale toast until dismissed, required by decision 1.
- Admins: the reason line in Blocked pilots, only if Question 3 is approved.

## Questions for the owner

1. **Notice placement and lifetime.** Toast until dismissed, in-page `Banner`, or timed toast? Recommended: one merged toast with Dismiss; delete dismissed notices after 7 days, undismissed after 90.
2. **Seller as map creator.** Notify a seller who created an affected map? Recommended: no; they made the sale.
3. **Re-admission view.** Today's list, list plus a reason line on sale-created rows, or a confirm dialog? Recommended: the reason line.
4. **Admins too, or creator only?** Recommended: creator only, matching "map owners".
5. **EVE mail to the corp?** Needs a new scope and consent screen. Recommended: no.
6. **Buyer already on the map.** Block even then? Recommended: no; the corp grant is not what admits them.
7. **Cache-tier data on sale.** Re-seal to the buyer as today, or delete and queue the first sync at once? Recommended: re-seal.
