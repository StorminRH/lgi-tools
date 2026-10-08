# Part 22: Assets, valuation and net-worth history

**Status:** Draft for owner review

**Carried from the Part 4 review (2026-10-08), private `'use cache'` audit:** today's cached private reads live only in per-instance memory and rarely hit on serverless (Next docs: entries "rarely survive between requests"; no hit-rate metric exists). Tag invalidation is per instance, so a cron save leaves other warm instances serving old 'hours' data (assets, blueprints, structures, holdings, corp snapshot) for up to an hour; the board already bypasses the cache for net worth (`board-view.ts:82-83`). The board reads each character's `character_skills` row twice (queue and skill levels); one query would do. `revalidateTag` on rig saves (`owned-structures/queries.ts:162`) invalidates nothing useful. Private content never moves to `'use cache: remote'`.

## In one paragraph

Owned assets and blueprints become one sealed document per character, written by the workers at sync time (Part 18). Net worth keeps filling in once a night, exactly as today. The difference is that the valuation runs inside the sealed service. It reads the whole public price book from Neon and each account's sealed holdings, and writes a sealed day row under the account's user key. The daily batch keeps its order: prices, then the queue drain, then revaluation, and the sealed service enforces that order itself, because drain jobs can still be running there when the Vercel steps move on. Pilot counts and a new list of pilot IDs stay readable, so LGI's servers can still delete every day that included an unlinked or sold pilot without opening anything. Merges stay a plain SQL move. Price rows stop being seeded from what users own. Users see nothing new.

## How it works today

- **Holdings.** `owned_assets` holds one row per owner per (type, location, flag, location type), quantities summed, plus a `snapshot_id` link to `esi_snapshots` set by corp pulls. A refresh deletes and re-inserts the owner's set; `owned_assets_natural_key_unique` turns overlapping refreshes into `superseded`. `owned_blueprints` is similar without the guard. Sync state sits in `owned_asset_syncs` and `owned_blueprint_syncs`.
- **Asset views.** There is no assets page. The planner posts up to 4,096 type IDs to `/api/industry/owned-assets` and `/api/industry/owned-blueprints`; the server filters by type and corp grant. `measureOwnedDataRead` records type IDs sent and rows returned. The board reads asset rows only to value them.
- **Valuation.** `valueCharacter` adds wallet, assets, implants, sell orders at market and buy-order escrow, skipping blueprints, SKINs and the `Skill` and `Wardrobe` flags. A unit is worth min(Jita 5% mid, CCP average). `pilotWorthOf` values a pilot only if `worthEligible` passes: scope health (`hasRefreshToken`, `missingScopes`) allows wallet and assets, and the wallet is not `denied`. Both are module-private in `board-assemble.ts`. `netWorthSnapshot(raws, names: NameBook, day)` uses only the name book's prices and categories, from `resolveValuationBook(typeIds)`: `IN` queries over `market_prices`, `adjusted_prices` and `eve_types` joined with `eve_groups`.
- **Nightly revaluation.** `daily-batch` runs in the 12:00 UTC hour: map purge, prices, indices, ESI queue drain, revaluation (only if prices succeeded), statics on Mondays, housekeeping. The drain is synchronous, so deferred holdings land before revaluation. `revalueAllNetWorth` walks every account with a linked character, day-rotated, in 60 seconds, with no ESI call and per-account failure isolation. It writes a `cron_net_worth` run record.
- **Roster changes.** Link, unlink and transfer call `revalueAfterRosterChange` after the response.
- **Recording.** `upsertNetWorthDay` is a plain last-write-wins `ON CONFLICT DO UPDATE` per (account, UTC day) that prunes to 365 days. It locks the pilots' `account` rows `FOR SHARE` and writes nothing if a pilot is no longer linked.
- **Reads and chart.** The board never values on view. It sends stored days and each pilot's latest stored worth (`latestStoredWorth`). The browser charts from `day.pilots` only. `accountWorthSeries` sums current-roster pilots and carries each pilot's last value over missing days; `pilotWorthSeries` does one pilot; `stackWorth` backfills wallet-only points from the journal before the first recorded day. Day totals and `included`/`total` are sent but not rendered. The "N of M pilots" note comes from each character's current `netWorth` section (`netWorthTotals`).
- **Erasure and merge.** `eraseNetWorthHistoryForCharacter` deletes every day whose `pilots` contains the character, on unlink, transfer and sale. A user purge deletes all days. On merge, `executeMergeRules` moves the source's days in SQL inside the merge transaction (`survivor-wins` on `day`).
- **Price seeding.** `seedUnpricedTypes` inserts a placeholder `market_prices` row for each owned marketable type that has none, so the table shows what users own (06 leak 6).

Files: `src/composition/board/` (`net-worth-nightly.ts`, `board-view.ts`, `board-assemble.ts`, `net-worth-link.ts`, `price-book.ts`, `api-contract.ts`); `src/components/composition/board/` (`board-view-model.ts`, `OverviewCards.tsx`); `src/features/net-worth/` (`queries.ts`, `valuation.ts`, `purge.ts`); `src/features/owned-assets/` (`schema.ts`, `queries.ts`, `sync-eligibility.ts`); `src/features/owned-blueprints/`; `src/features/character-sheet/sync-eligibility.ts`; `src/data/eve-data/character-facts.ts`; `src/composition/account-lifecycle/account-merge.ts`; `src/app/api/cron/daily-batch/route.ts`; `src/app/api/cron/revalue-net-worth/declaration.ts`; `src/app/api/industry/owned-assets/route.ts`; `src/app/api/owned-data-telemetry.ts`; `src/data/market-prices/ingest.ts`.

## What changes

Nothing visible changes for users. The chart fills in at the same time of day, with the same values, the same per-character coverage note and the same 365-day window. Behind the scenes:

- Holdings, wallet, orders and implants are sealed, so Vercel can no longer value them. Valuation moves into the workers.
- `net_worth_days` values and the per-pilot breakdown become sealed. A readable `pilot_ids` column keeps erasure and the write guard in plain SQL.
- The workers load whole public price tables, never a list of owned types.
- `seedUnpricedTypes` is deleted. The daily batch seeds every published, marketable type instead (Part 04, PR 0-6).

## Design

**Holdings documents.** Part 02's shape D and Part 18's write protocol; sync-state tables follow Part 18. The corp axis belongs to Part 23.

| Table | Readable | Sealed content | Key | Replaces |
|---|---|---|---|---|
| `owned_assets` (character) | `owner_type`, `owner_id`, `version`, `key_id`, `updated_at` | Today's aggregated rows | User key | `owned_assets_natural_key_unique` (version compare-and-swap); `snapshot_id` dropped (corp rows and `esi_snapshots` in Part 23) |
| `owned_blueprints` (character) | Same | Item ID, type, ME, TE, runs, quantity, location ID, flag | User key | Owner index |

Purge and merge rules stay `follows-character`. Part 21's `holding_index` and `blueprint_index` views are built from these documents.

**`net_worth_days` after the change.**

| Column | Class | Notes |
|---|---|---|
| `user_id`, `day` | Readable | Primary key, as today |
| `pilots_included`, `pilots_total` | Readable | Written as today, not rendered today |
| `pilot_ids integer[]` | Readable, new | Pilots counted that day (Part 11). Drives the erase and the write guard |
| `recorded_at` | Readable | As today |
| `key_id` | Readable, new | Key record of the user key that sealed the day |
| `sealed` | Sealed | `{netWorth, liquidIsk, pilots: {id: {netWorth, liquidIsk}}}`, kept whole so `toHistoryDay` is unchanged. AAD: label, table, `day`, `key_id` |

The AAD has no `user_id` and no version. `key_id` binds ownership, as Part 11 sets for user-key rows, so merged days open as they are. With no version, two writers on one day cannot break each other's blob. The only rollback left is restoring an earlier blob of the same day, which is accepted. Part 09 records this table as an exception to its owner-and-version rule.

**Upsert.** `upsertNetWorthDay` keeps today's single last-write-wins statement, run by the workers over TLS that ends in the enclave. It writes `pilot_ids`, `key_id` and `sealed` in place of the value columns. The linked-pilot lock reads `unnest(pilot_ids)`. The prune is unchanged.

**Valuation in the workers.**

1. Load the price book with `loadValuationBook()`, a whole-table variant of `resolveValuationBook`: all of `market_prices` (with today's `flooredMid`), all of `adjusted_prices`, and categories from `eve_types` joined with `eve_groups`. Cache it in memory, keyed by the latest sweep time.
2. For each account, list linked characters with readable scope health, as Part 18's engine does. Unwrap the user key. Open each pilot's assets document and the wallet (with `denied`), orders, implants and clones sections.
3. Run `worthEligible`, `pilotWorthOf`, `valueCharacter` and `netWorthSnapshot`, exported from the shared module Part 19 splits out of `board-assemble.ts`. The first two and `netWorthSnapshot` take a narrowed `{prices, typeCategories}` instead of `NameBook`, and a `ValuationRaw` subset of `BoardRaw` (identity, health, wallet, assets rows, implants, clones, orders) that `BoardRaw` still satisfies. Logic is unchanged.
4. If at least one pilot has a computable worth, seal and upsert the day. Return only counts and codes.

**Triggers.**

| Trigger | After |
|---|---|
| Daily batch | Once the drain step has its replies or hits its 90-second limit (Part 18), the Vercel step posts one `revalue` job (Part 07) carrying the batch run ID and drain job IDs, only if prices succeeded. It waits up to 60 seconds for the summary: accounts, revalued, failed, deferred |
| Ordering | The workers start a batch's `revalue` job only after every drain job from that run has finished. A failed or deferred drain job counts as finished, as today |
| Roster change | Part 18's roster job ends with valuing that account |
| Enclave unavailable | The step records `sealed_unavailable` on the `cron_net_worth` run record. An hourly Convex cron calls a cron-gated Vercel route. If today's prices succeeded and today has no successful revaluation, it re-posts the job. Part 29 owns the cron |

The workers keep the day-rotated order and failure isolation. They only run jobs; they never start revaluation themselves.

**Erasure.** `eraseNetWorthHistoryForCharacter` becomes `DELETE … WHERE user_id = $1 AND $2 = ANY(pilot_ids)`, with no decryption, for unlink, transfer and sale (Parts 11 and 14). A user purge deletes all rows and the user key record.

**Merge.** Today's `survivor-wins` SQL move is unchanged, with no enclave call in the transaction. Moved days keep their `key_id`. On confirming the merge, custody adds the source's user key to the survivor's key record (Part 11's keyring), so moved days open without a re-seal. Until the confirm lands (Part 11: login waits for it; a timeout retries on the next sealed request), moved days do not open and look like missed days.

**Board read.** The route sends stored days with the sealed blob. The browser decrypts them, runs `toHistoryDay` and `latestStoredWorth` in Part 19's finish step, then `accountWorthSeries`, `pilotWorthSeries` and `stackWorth` unchanged. A day that fails to open is left out and logs a code. Carry-forward and wallet backfill hide the gap. No error is shown.

**Asset filtering.** Type filtering moves from Vercel to the browser, over the decrypted `holding_index` and `blueprint_index` (Part 21); requests carry no type list. Corp-grant filtering (`visibleCorpAssetInputs`) moves to the workers (Part 23). Valuation exclusions run in the workers. `measureOwnedDataRead` stops recording type-list sizes and row counts for these reads, keeping endpoint, duration and outcome.

**Price seeding.** Part 04's PR 0-6 ships in Phase 0: the daily batch seeds every published type with a market group, and `seedUnpricedTypes` and `ResolvedNameBook.unseededTypeIds` go. The sweep already reads the whole Forge dump, so this costs no extra ESI calls.

**Ordering with other phases.** Valuation moves into the workers no later than the release that first seals any of its inputs. Until then, the workers may read the plaintext tables. Part 31's resumable job converts existing days: fill `pilot_ids` from `pilots`, seal the values, drop the plaintext columns.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| Asset and blueprint document owner, version, `updated_at`, size | Yes. Size gives an approximate holding count (Part 18 question 2 covers padding) | | LGI server |
| Asset and blueprint rows | | Yes | Sealed service (sync) |
| Page ETags | Follows Part 18 | Part 18 proposes sealing them; the brief's default keeps them readable | Sealed service |
| Sync state (`owned_asset_syncs`, `owned_blueprint_syncs`) | Per Part 18 | | LGI server |
| Net-worth `user_id`, `day`, `recorded_at`, `key_id` | Yes | | LGI server |
| `pilots_included`, `pilots_total`, `pilot_ids` | Yes | | Sealed service writes; LGI server erases |
| Day total, liquid ISK, per-pilot breakdown | | Yes | Sealed service; browser decrypts |
| Stored worth per pilot, chart series | | Derived in memory | Browser |
| Market prices, adjusted prices, type categories | Yes (public data) | | LGI server (sweep); read whole by the sealed service |
| Owned-data telemetry | Yes, no type or row counts | | LGI server |
| Type-filtered planner holdings | | Yes | Browser filters the decrypted view |
| Corp-filtered holdings | | Yes | Sealed service (Part 23) |

## Hard rules

1. [Agreed] Users notice nothing: same chart, nightly timing, "N of M pilots" note and 365-day window, no new copy. (Principle 1.)
2. [Agreed] Net-worth history is personal data (decision 9), sealed under the user key and lost only if the key records are destroyed and the user has no passkey or recovery key.
3. [Proposed] Holdings, wallet, orders, implants and every derived value are plaintext only in the enclave and the owner's browser. (Derived from principle 2.)
4. [Proposed] Batch order holds: prices, indices and the drain, then revaluation only if prices succeeded. The workers start a batch's `revalue` job only after every drain job from that run has finished.
5. [Agreed] Erasure matches today: every day that counted an unlinked, transferred or sold pilot is deleted.
6. [Proposed] Valuation runs only in the workers, using today's functions with narrowed inputs and unchanged logic. Nothing values on view.
7. [Proposed] The workers read public price and category tables whole and never send anyone a list of owned types.
8. [Proposed] `pilot_ids`, `pilots_included`, `pilots_total`, `day`, `recorded_at` and `key_id` stay readable; nothing else on the row does.
9. [Proposed] A day's AAD is label, table, `day` and `key_id`. The upsert stays last-write-wins with no version.
10. [Proposed] No erase or prune path decrypts a day.
11. [Proposed] Merge stays today's SQL `survivor-wins` move, with no re-seal and no enclave call in the transaction. Custody adds the source's user key to the survivor's key record after confirming the merge (Part 11).
12. [Proposed] The browser leaves out a day that fails to open, logs a code and shows no error.
13. [Proposed] `market_prices` is seeded from the published marketable type list only.
14. [Proposed] Revaluation covers every account with a linked EVE character, as today.
15. [Proposed] The price-book cache holds public data only, keyed by the latest sweep time and reloaded when it changes.
16. [Proposed] The Vercel step waits at most 60 seconds and never values anything.
17. [Proposed] Scheduling stays outside the enclave. Outage catch-up is posted by a cron reading readable run records.
18. [Proposed] Enclave logs, the Vercel step and owned-data telemetry record account counts, codes and job IDs only, never type-list sizes or holding row counts.
19. [Proposed] Browser asset requests carry no type IDs; type filtering happens after decryption.
20. [Proposed] Valuation moves into the workers no later than the first release that seals any input. Workers read plaintext tables only before that release.
21. [Agreed] `pnpm check` and `pnpm verify` pass with zero Fallow findings. (Project rule.)

## Assumptions

- **The whole price book fits easily in enclave memory.** Seeding every marketable type gives roughly 15,000 to 20,000 rows. Check: count published types with a market group, and measure the loaded size.
- **Seeding every type does not slow the sweep beyond its slot.** Check: time the price step on staging after PR 0-6.
- **Revaluation for 18 accounts finishes inside 60 seconds, even after waiting for the drain.** Check: time it on the dev sealed service with production volumes.
- **`pilot_ids` reveals nothing new.** Linked characters are readable and `pilots_included` gives the count today. Check against Part 03's budget.
- **Same-day rollback is not worth defending.** Check: nothing trusts a day's value beyond display.
- **No server code fills missed days.** Checked: only the nightly revalue and roster changes write days; the browser's carry-forward and backfill stay unchanged.
- **Corp holdings never feed net worth.** Checked: `readRaws` reads character owners only.
- **Limits stay as Part 01 states them.** Sealing protects these values from anyone reading LGI's stores or backups. It does not protect them from someone holding the user's EVE login (decision 5), from whoever serves lgi.tools shipping code that leaks keys after login, or from the AWS account owner changing the key-release rule, which would show in the published fingerprints (Part 06).

## What users see

Nothing new. The one change in failure behaviour: if the enclave stays down for the rest of the UTC day after the batch, that day is missing from the chart, and the carry-forward hides it. Today a failed price step causes the same gap.

## Questions for the owner

1. **Which `net_worth_days` fields stay readable?** Options: (a) day, recorded time, pilot counts and pilot IDs; (b) also seal the counts, though `pilot_ids` still reveals the included count; (c) no `pilot_ids`, with erasure done by the enclave opening each day. Recommended: (a). Erasure stays plain SQL and needs no enclave.
2. **Should revaluation keep running for every account with linked characters?** Options: (a) yes, as today; (b) only accounts seen recently. Recommended: (a). It makes no ESI call and costs seconds. Option (b) would leave gaps that returning users would notice.
3. **Where does asset filtering run?** Options: (a) type filtering in the browser over the precomputed views, and corp filtering in the workers; (b) live sealed-service queries per planner request; (c) the browser for everything. Recommended: (a). Option (b) puts the enclave on the page path. Option (c) would send corp rows beyond the viewer's grant.
4. **Same-day catch-up after an enclave outage?** Options: (a) an hourly cron re-posts the missed `revalue` job the same UTC day once the price step has succeeded; (b) skip the day, as with today's failures. Recommended: (a). It is invisible and keeps the chart as complete as today.
