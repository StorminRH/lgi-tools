# Ordinary Work As-Built — Fold leftover auth, data, and industry tests

**Record status:** Final
**Recorded:** 2026-08-26
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `stormin/test-cleanup-combined-3a87`
**PR:** `#33`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

None.

## Divergences from plan

None.

## Final surfaces

- `src/data/market-history/api-contract.test.ts` — `wireHistoryInputsSchema._output` equals `MarketHistoryInputs`
- `src/data/market-prices/api-contract.test.ts` — wire `source` options equal `PriceSource`
- `src/data/industry-math/fees.test.ts` — reaction SCC surcharge equals `DEFAULT_FEE_RATES.sccSurcharge`; `MAX_FACILITY_TAX_PCT` is 10
- `src/features/wormhole-sites/components/SitesFilterLayout.test.ts` — 15 `aria-pressed` controls and 4 `role="group"` containers
- `src/features/wormhole-sites/components/resource-row-view.test.ts` — relic and ore column layouts plus null dot states
- `src/app/(site)/admin/ops-view.test.ts` — `SLI_DEFINITIONS` ids match `SLI_IDS`
- `src/platform/auth/affiliation.test.ts` — fail-closed character check takes a named affiliation
- `src/data/eve-data/tree-resolver.test.ts` — fixture cast stays off `_meta`
- `src/data/eve-data/systems-search.test.ts` — system-search wire types live here after `api-contract.test.ts` went away

## Discovered work

None.

## Successor notes

- Combined `stormin/test-cleanup-auth-2b99`, `stormin/test-cleanup-data-leftovers-ae9f`, and `stormin/test-cleanup-industry-b0e2` onto `development`. The data branch had edited two Under the Hood tests that `development` already deleted. Those stay deleted.
- Dump is GitHub #460. CodeRabbit asked for `!` guards or sermons on `prev!`, `mock.calls[0]!`, `items[n]!`, and `jobs[0]!`, and to restore catalogue length 69 plus a full-loop lookup. Left unfixed. Preceding length or call-count assertions already pin the index. Census pins were dropped on purpose. The walkthrough merge-risk about a duplicate declaration is false. Zero duplicate top-level bindings in the packet. `pnpm typecheck` and 766 focused tests passed. Dump GitHub `test` passed. Greptile did not reply. Cursor Security Agent passed with no comments.
- Comment-sicko reshape flags on `tolerance` / Drifter Sheet slack in `math.test.ts`, `arch.typeId === 37472` Avenger `/10`, `RIFTER_ADJUSTED` versus unnamed `buildCost: 570_000` in `fees.test.ts`, and `SYSTEMS` fixture order in `systems-search.test.ts` stay open. This close-out does not rename those.
- Sheet-snapshot sermons in `npc-stats/math.test.ts` and the PR #111 header on `SitesFilterLayout.test.ts` stay. Unique wire and a11y pins restored on `662b4c91` stay.
- Capability catalogue size 50, site-name-lookup length 69, and tree-resolver material counts stay dropped.

## Verification summary

- **Adversarial review:** Subject: isolated app-facing packet `origin/staging` `7788e81e75782449129ae373aa6aa6e7b602a5ba`..`stormin/test-cleanup-combined-3a87`, then corrected on `662b4c91d98dcb084a6570f9a392bba3eddf31f3`; Roles: structure-reviewer, behavior-reviewer, thermos, no-comments; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: bidirectional wire `expectTypeOf` locks, fee literals, `aria-pressed` count 15, four `role="group"` containers, and relic/ore `colsClass`/`dotTone` pins accepted and restored. Census-size pins, mega-test to `it.each` rewrite, numeric `securityStatusTextClass` bands folded into `system-identity.test.ts`, SiteCard hover glow now on `card.tsx`, TE smoke that still has `clampTe`, and SLI uniqueness already on `ops-view.test.ts` rejected as authorized cleanup. Comment-sicko deletions accepted except the sheet-snapshot sermons and the PR #111 header.
