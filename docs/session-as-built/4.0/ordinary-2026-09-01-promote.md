# Ordinary Work As-Built — Maps lifecycle, signatures split, and site sell prices

**Record status:** Final
**Recorded:** 2026-09-01
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#55`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

Staging now dual-writes one exclusive Neon map lifecycle status next to the old timestamps. Harvestable site live ISK uses Jita bestSell, the same stored figure the planner uses for product revenue. Mapper scanner hosts and composition registries split by job. Scanner Enter on a matching inbound hole links that door the same way a click does.

- Changed: harvestable site live ISK uses Jita best sell
- Changed: stored Jita buy figures drop hub bids under 35% of the hub ask
- Fixed: a tombstoned map no longer appears as a live map when archived_at is null
- Fixed: scanner Enter on a named inbound hole links that door instead of writing a second destination

## Divergences from plan

None.

## Final surfaces

- `src/data/maps/lifecycle-contract.ts` — status to timestamp shapes for tests and publish
- `src/data/maps/lifecycle.ts` — archive, restore, purge, claim, and tombstone dual-write
- `drizzle/0059_maps_lifecycle_status.sql` — enum, columns, and backfill
- `src/data/market-prices/book-math.ts` — buy/sell spread floor
- `src/features/wormhole-sites/live-prices.ts` — harvest overlay from bestSell
- `src/mapper/signatures/scanner-leads-control.tsx` — Enter and click share one origin lead list
- `src/composition/page-settings/specs.ts` — page-settings spec list
- `src/composition/purge/orchestrator.ts` — purge side-effect boot

## Discovered work

None.

## Successor notes

- Reader cutover and the lifecycle CHECK wait. Writers dual-write. Listing and purge eligibility still key the four timestamps. `lifecycle-contract.ts` is not yet the only write path.
- `bindConnectionSetters` still lives in `SignatureProvider`. Hoist it later with the existing `ConnectionDetail` type guard.
- Comment-sicko reshape flags on `BUY_SPREAD_FLOOR_RATIO`, `applySpreadFloorToBuyFigures`, `bucketToRawPrice`, and `overlayLivePrices` stay open. This close-out does not rename those.
- Dump is GitHub #466.

## Verification summary

- **Adversarial review:** Subject: Origin `55`; `origin pr diff 55`; Roles: structure-reviewer, behavior-reviewer, thermos, comment-sicko; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: scanner Enter origin-lead list accepted and fixed. Timestamp readers, contract-owned dual-write, `bindConnectionSetters` hoist, comment-sicko reshape flags, dump contract comments, `emptyClass[0]!`, nullable tombstone factory, and overlapping purge claims rejected.
