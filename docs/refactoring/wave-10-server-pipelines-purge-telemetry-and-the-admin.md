# Wave 10: Server pipelines, purge, telemetry and the admin console

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

← [Wave 9: Auth, routes and the mutation/transport pipeline](wave-09-auth-routes-and-the-mutation-transport-pipeline.md) · [Index](README.md#roadmap) · [Wave 11: ESI reads, owner-sync and owner-dataset persistence](wave-11-esi-reads-owner-sync-and-owner-dataset.md) →

In order:
1. Price-source health.
2. Stale-rejecting projections, then their cleanup, then the deadline runner.
3. purgeOwnedMapChains, then generated purge contributors.
4. Valuation removed from NameBook; scripts bootstrap.
5. The admin console:
   - move period math into app/(site)/admin
   - share RANGE_DAYS
   - cache range reads per request
   - share signal loaders
   - build the budget card on deriveBudgetStatus
   - trim view models
   - derive hrefs from admin-sections
6. The after()-scheduled usage emitter (medium risk, high payoff), once the route bodies it touches have settled.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☐ | [P162](#p162) | Share the price-source degradation predicate, payload projection and type | server-pipeline | S | low | low | [P173](wave-03-src-lib-primitives-collections-math-async.md#p173) |
| ☐ | [P164](#p164) | Make map-access projections reject stale outcomes by default and share the delivery budget constants | server-pipeline | S | low | medium | — |
| ☐ | [P322](#p322) | Drop the constant projectionPending, the outer teardown currency checks, and the affiliation/transfer pass-through wrappers | simplification | S | low | low | [P164](#p164) |
| ☐ | [P165](#p165) | Share one sequential deadline runner for the housekeeping retry loops | server-pipeline | S | low | medium | [P164](#p164) |
| ☐ | [P166](#p166) | Route every owned-map chain purge through one composition helper | server-pipeline | S | low | low | — |
| ☐ | [P240](#p240) | Generate the single-table purge contributors from one table list in src/platform/purge | persistence | S | low | medium | — |
| ☐ | [P321](#p321) | Remove valuation from the board NameBook: netWorthSnapshot takes the ValuationBook and NameIdRequest drops valuationTypeIds | simplification | S | low | low | — |
| ☐ | [P174](#p174) | Give src/scripts one bootstrap: a load-env side-effect import, createScriptClient, client-optional runScript and publicTableExists | server-pipeline | M | low | low | — |
| ☐ | [P316](#p316) | Move admin period math into app/(site)/admin, absorb lastNDaysRange, and align parseRange with its client twin | simplification | M | low | low | [P107](wave-04-formatting-dates-and-names-have-one-home.md#p107) |
| ☐ | [P282](#p282) | Share the range-key day count and keep admin reads from waiting on the GSC report date | efficiency | S | low | low | [P316](#p316) |
| ☐ | [P281](#p281) | Cache degradation and search-total reads per request with one range-keyed helper, and drop dead ESI cost reads | efficiency | S | low | medium | — |
| ☐ | [P158](#p158) | Share the admin cron, SLI and activity loaders between the overview, health and traffic cards | server-pipeline | S | low | medium | — |
| ☐ | [P299](#p299) | Build the ESI budget card on deriveBudgetStatus, drop the dead cost-lens inputs, and share admin job-count and age helpers | simplification | M | low | medium | [P281](#p281), [P091](wave-04-formatting-dates-and-names-have-one-home.md#p091), [P085](wave-04-formatting-dates-and-names-have-one-home.md#p085), [P088](wave-04-formatting-dates-and-names-have-one-home.md#p088) |
| ☐ | [P314](#p314) | Trim admin and corporations view models to rendered fields and show search truncation in the results body | simplification | S | low | low | — |
| ☐ | [P315](#p315) | Derive admin hrefs, titles and range controls from admin-sections instead of literals | simplification | M | low | low | [P316](#p316) |
| ☐ | [P159](#p159) | Route every usage-telemetry write through one after()-scheduled emitter, sharing the scheduler with domain events | server-pipeline | M | medium | high | [P130](wave-03-src-lib-primitives-collections-math-async.md#p130), [P141](wave-09-auth-routes-and-the-mutation-transport-pipeline.md#p141) |

<a id="p162"></a>

## P162: Share the price-source degradation predicate, payload projection and type

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -30 / +20 (declaration -20/+6, route -6/+3, refresh-on-view -6/+1, new helper ~12)
- **Depends on:** [P173](wave-03-src-lib-primitives-collections-math-async.md#p173)
- **Existing primitive:** `src/lib/alerts.ts:PriceSourceDegradation`

**Problem.** Whether a price refresh is 'degraded' (fuzzworkFallbackCount > 0 || budgetExhausted) and the price_source_degraded payload are written independently in the cron declaration and the on-demand route. The cron declaration then repeats the same four-field projection for the domain event, the usage record, the Discord alert and the run telemetry. The four-field shape is declared twice: lib/alerts PriceSourceDegradation and data/market-prices LivePricesDegradation. getDegradationByCaller and the budget-exhaustion queries compare the two callers' rows, so their predicate and fields must stay in lockstep.

**Verifier revision.** Confirmed: the cron sweep and the on-demand route share the same degradation predicate and the same four-field payload, and the cron declaration hand-copies the four fields four times. Scope grows: data/market-prices/refresh-on-view.ts declares LivePricesDegradation, field-for-field identical to lib/alerts PriceSourceDegradation. Design changes: the finder's `priceSourceDegradation(summary): PriceSourceDegradation | null` does not fit the cron. Its domain event and telemetry need the four counts even when not degraded, so the helper should return { counts, degraded }. The projection must stay explicit, because RefreshSummary also carries requested, written and durationMs, and the cron tests pin the exact record and alert payloads.

**Sites (8).**

- [`src/app/api/cron/refresh-prices/declaration.ts:42-92`](../../src/app/api/cron/refresh-prices/declaration.ts#L42-L92) — predicate (43-44) plus four hand-copied projections: domain event 45-56, record 59-65, alert 68-73, telemetry 80-86
- [`src/app/api/market-prices/refresh/route.ts:27-42`](../../src/app/api/market-prices/refresh/route.ts#L27-L42) — same predicate and payload with caller 'on-demand'
- [`src/lib/alerts.ts:5-10, 29-60`](../../src/lib/alerts.ts#L5-L10) — PriceSourceDegradation type and its alert consumer
- [`src/data/market-prices/refresh-on-view.ts:20-25, 53-57, 96-101`](../../src/data/market-prices/refresh-on-view.ts#L20-L25) — LivePricesDegradation duplicates PriceSourceDegradation; used in LivePricesResult
- [`src/data/market-prices/ingest.ts:10-18`](../../src/data/market-prices/ingest.ts#L10-L18) — RefreshSummary carries the four fields plus requested, written and durationMs
- [`src/data/telemetry/queries.ts:206-243, 263-280`](../../src/data/telemetry/queries.ts#L206-L243) — readers: budgetExhausted count, on-demand budget window, degradation by caller
- [`src/app/api/cron/refresh-prices/route.test.ts:105-176`](../../src/app/api/cron/refresh-prices/route.test.ts#L105-L176) — pins exact record, alert and domain-event payloads
- [`src/app/api/market-prices/refresh/route.test.ts:109-175`](../../src/app/api/market-prices/refresh/route.test.ts#L109-L175) — pins the exact on-demand payload and that a clean read emits nothing

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/market-history/refresh/route.ts:26-40`](../../src/app/api/market-history/refresh/route.ts#L26-L40) — History signals only budgetExhausted, through console.warn and market_history_refresh telemetry. It has no Fuzzwork fallback count, so it is a different concept.

</details>

**Home.** `src/data/market-prices/source-health.ts (new), typed by the existing src/lib/alerts.ts:PriceSourceDegradation`

**Boundary check.** source-health.ts is in zone data, and the rule 'from: data' allows 'lib' for the type import. Consumers: src/app/api/cron/refresh-prices/declaration.ts and src/app/api/market-prices/refresh/route.ts are zone api, and the rule 'from: api' allows 'data'. refresh-on-view.ts (data) importing the type from lib is allowed. The canonical type cannot move into data because the rule 'from: lib' allows only 'config', and lib/alerts consumes it.

**API sketch.**

```ts
import type { PriceSourceDegradation } from '@/lib/alerts';
export function readPriceSourceHealth(s: PriceSourceDegradation): {
  counts: PriceSourceDegradation; // exactly { fetched, esiCount, fuzzworkFallbackCount, budgetExhausted }
  degraded: boolean;              // s.fuzzworkFallbackCount > 0 || s.budgetExhausted
}
```

**Migration steps.**

1. Add src/data/market-prices/source-health.ts with readPriceSourceHealth, which projects the four fields explicitly (no spread of the input), plus source-health.test.ts covering the clean, fallback-only, budget-only and both cases. The file needs a test because coverage.requireAllFiles is on.
2. In refresh-on-view.ts, delete the LivePricesDegradation interface and type `degraded` and LivePricesResult.degraded as PriceSourceDegradation (type import from '@/lib/alerts'). Optionally declare RefreshSummary in ingest.ts as `extends PriceSourceDegradation`.
3. In the cron declaration, compute `const { counts, degraded } = readPriceSourceHealth(summary)`. Use `{ outcome: degraded ? 'degraded' : 'completed', ...counts, written: summary.written, durationMs: summary.durationMs }` for the domain event, `record('price_source_degraded', { caller: 'cron', ...counts })`, `alertPriceSourceDegradation(counts)`, and `telemetry: { ...counts, written: summary.written }`.
4. In the on-demand route, use `const health = readPriceSourceHealth(degraded); if (health.degraded) emitCostMetric('price_source_degraded', { caller: 'on-demand', ...health.counts })`.
5. Leave both route tests unchanged; they must still pass because the payloads are identical.

**Tests.** New src/data/market-prices/source-health.test.ts. The existing exact-payload guards in src/app/api/cron/refresh-prices/route.test.ts:105-176 and src/app/api/market-prices/refresh/route.test.ts:109-175 must pass unchanged.

**Notes.** No drift found: both copies use the same predicate and fields today. Keep the projection explicit. Spreading `summary` would leak requested, written and durationMs into price_source_degraded and the alert, and break the exact toHaveBeenCalledWith assertions. The on-demand input (live-read degradation) counts per live fetch, while the cron input counts persisted rows. The semantics match, and it is the same type. The name PriceSourceDegradation reads oddly for non-degraded counts; renaming it to PriceSourceCounts in lib/alerts is optional and cosmetic.

<sub>Reported by: area:app-api.</sub>

<a id="p164"></a>

## P164: Make map-access projections reject stale outcomes by default and share the delivery budget constants

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -12 production lines (6 wraps and imports) plus 4 for constants; about -15 test lines (3 mock re-implementations and stale doubles); +1 new map-creation test
- **Depends on:** —
- **Existing primitive:** `src/composition/map-access-projection.ts:requireCurrentProjection`

**Problem.** A 'stale' projection outcome is a failure for every production caller, but projectMapAccess and projectStagedMapAccess return it as data, so each caller must remember to call requireCurrentProjection. Four callers do. Two more re-check teardown, which already enforces the rule. map-creation's staged-projection ladder forgets the check and treats 'stale' as delivered. In that case a newer projection, such as an affiliation reconcile that saw the still-archived staged map and projected [] claims, has won, and creation publishes the map anyway. The per-delivery timeout 4_000 and the 20_000 reconcile budget are named in map-affiliation-access but repeated as literals in tracking-merge-retry.

**Verifier revision.** The core claim holds, and the code shows more than the finders cited. Every production caller of projectMapAccess wraps the result in requireCurrentProjection: map-access-update.ts:73, map-lifecycle.ts:41-43, map-affiliation-access.ts:47-49 and tracking-merge-retry.ts:38. teardownMapAccessProjection already applies the check itself (map-access-projection.ts:269), yet map-purge.ts:72 and map-creation.ts:162 apply it again because their DI test doubles return 'stale'. Two test files re-implement requireCurrentProjection inside vi.mock factories, and a third stubs it. The finders missed a drift: map-creation's ladder (map-creation.ts:91-97) never checks the staged projection result, so a 'stale' outcome counts as success and the map is published. Revisions to the proposal: (1) drop projectAndAcknowledge. Once the stale check is internal, each site's try block is two lines, and the two sites map failure in opposite ways (an error result versus ok with projectionPending), so a helper with two DI parameters would add indirection without saving lines. (2) Add no raw variant for scripts; they can surface the error. (3) The constants cannot be exported from map-affiliation-access for tracking-merge-retry, because map-affiliation-access.ts:1 already imports tracking-merge-retry and the reverse import would form a cycle that Fallow rejects (circular-dependencies: error). They belong in map-access-projection.ts, which both files already import.

**Sites (14).**

- [`src/composition/map-access-projection.ts:62-69`](../../src/composition/map-access-projection.ts#L62-L69) — requireCurrentProjection, exported and applied by every caller
- [`src/composition/map-access-projection.ts:253-274`](../../src/composition/map-access-projection.ts#L253-L274) — projectMapAccess and projectStagedMapAccess return 'stale'; teardown already applies requireCurrentProjection at 269
- [`src/composition/map-access-update.ts:72-81`](../../src/composition/map-access-update.ts#L72-L81) — requireCurrentProjection(await projectAccess(...)), then acknowledge; ProjectionUnavailableError maps to { ok:false, reason:'projection-unavailable' }
- [`src/composition/map-lifecycle.ts:40-50`](../../src/composition/map-lifecycle.ts#L40-L50) — same block; ProjectionUnavailableError maps to log plus { ok:true, projectionPending:true }
- [`src/composition/map-affiliation-access.ts:11-14, 47-49`](../../src/composition/map-affiliation-access.ts#L11-L14) — named RECONCILE_BUDGET_MS/DELIVERY_TIMEOUT_MS; wraps projectMapAccess
- [`src/composition/account-lifecycle/tracking-merge-retry.ts:37-39, 53`](../../src/composition/account-lifecycle/tracking-merge-retry.ts#L37-L39) — literal timeoutMs 4000 with a requireCurrentProjection wrap; literal 20_000 deadline
- [`src/composition/map-purge.ts:71-78`](../../src/composition/map-purge.ts#L71-L78) — redundant requireCurrentProjection around teardownAccess, which already rejects stale
- [`src/composition/map-creation.ts:160-163`](../../src/composition/map-creation.ts#L160-L163) — redundant requireCurrentProjection around teardown
- [`src/composition/map-creation.ts:67-106`](../../src/composition/map-creation.ts#L67-L106) — projectOnCreationLadder awaits project(...) and returns without checking the outcome, so a stale result counts as success (drift)
- [`src/composition/map-affiliation-access.test.ts:17-23, 73-82`](../../src/composition/map-affiliation-access.test.ts#L17-L23) — mock factory re-implements requireCurrentProjection; 'stale' case
- [`src/composition/map-access-identity.test.ts:36-44`](../../src/composition/map-access-identity.test.ts#L36-L44) — mock factory re-implements requireCurrentProjection
- [`src/composition/account-lifecycle/tracking-merge-retry.db.test.ts:15-19`](../../src/composition/account-lifecycle/tracking-merge-retry.db.test.ts#L15-L19) — stubs requireCurrentProjection: vi.fn()
- [`src/scripts/project-map-access.ts:22-33`](../../src/scripts/project-map-access.ts#L22-L33) — prints the raw result; the only consumer that shows 'stale' to a person
- [`src/scripts/map-replay.ts:236-237`](../../src/scripts/map-replay.ts#L236-L237) — prints the projection result

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/location-tracking/merge.ts:13-89`](../../src/data/location-tracking/merge.ts#L13-L89) — timeoutMs: 4000 on the four tracking-merge Convex doors is a different budget (merge doors, not map-access projection); leave it, or name it locally
- [`src/composition/map-creation.ts:15-17`](../../src/composition/map-creation.ts#L15-L17) — the creation ladder's 2_000 attempt timeout and 20_000 deadline are a separate interactive budget, not the reconcile budget

</details>

**Home.** `src/composition/map-access-projection.ts (behaviour and constants)`

**Boundary check.** All changed production files are in the composition zone (src/composition/**). Imports within one zone are unrestricted. map-affiliation-access.ts and tracking-merge-retry.ts already import map-access-projection.ts, so the constants add no new edge and no cycle. Exporting them from map-affiliation-access.ts would create the cycle map-affiliation-access -> account-lifecycle/tracking-merge-retry -> map-affiliation-access, which Fallow rejects (circular-dependencies: error). The scripts zone (src/scripts/**) already imports composition, which the rule {from: scripts, allow: [composition, ...]} permits.

**API sketch.**

```ts
export type CurrentProjectionResult = ProjectionCounts & { readonly outcome: 'applied' | 'duplicate'; readonly characterScoped?: true };
export const MAP_ACCESS_DELIVERY_TIMEOUT_MS = 4_000;
export const MAP_ACCESS_RECONCILE_BUDGET_MS = 20_000;
/** Throws ProjectionUnavailableError when a newer projection already won. */
export function projectMapAccess(mapId: string, options?: ProjectMapAccessOptions): Promise<CurrentProjectionResult>;
export function projectStagedMapAccess(mapId: string, options?: ProjectMapAccessOptions): Promise<CurrentProjectionResult>;
export function teardownMapAccessProjection(mapId: string): Promise<CurrentProjectionResult>;
// requireCurrentProjection becomes module-private (function requireCurrent(result): CurrentProjectionResult)
```

**Migration steps.**

1. In map-access-projection.ts, add CurrentProjectionResult. Make requireCurrentProjection a non-exported function returning the narrowed type, and call it in projectMapAccessState after requireScopedDelivery (teardown already calls it). Change the three public return types to Promise<CurrentProjectionResult>. Export MAP_ACCESS_DELIVERY_TIMEOUT_MS and MAP_ACCESS_RECONCILE_BUDGET_MS.
2. Delete the caller-side wraps and their requireCurrentProjection imports: map-access-update.ts:73, map-lifecycle.ts:41-43, map-affiliation-access.ts:47-49, tracking-merge-retry.ts:38, map-purge.ts:72 (keep the try/catch so the MapPurgeUnavailableError wrapping stays) and map-creation.ts:162 (keep the try/catch that yields cleanup 'queued').
3. Replace the constants. In map-affiliation-access.ts:11-12, use the shared names (FINALIZE_RESERVE_MS and DELIVERY_CONCURRENCY stay local). In tracking-merge-retry.ts:38, use MAP_ACCESS_DELIVERY_TIMEOUT_MS. At :53, use MAP_ACCESS_RECONCILE_BUDGET_MS, or the deadline parameter that P165 introduces.
4. The DI aliases ProjectAccess (map-access-update.ts:16), Project and Teardown (map-creation.ts:22,24) and the typeof deps in map-lifecycle.ts and map-purge.ts narrow automatically. Fix every test double that now fails typecheck by resolving { outcome: 'stale' }: make it mockRejectedValue(new ProjectionUnavailableError('newer projection won')).
5. Remove the requireCurrentProjection entries from the vi.mock factories in map-affiliation-access.test.ts, map-access-identity.test.ts and tracking-merge-retry.db.test.ts. Supply the new constants there, either explicitly or by spreading importOriginal as character-authorization.test.ts:43-46 already does. Without them, tracking-merge-retry.db.test.ts:90's expectation of { timeoutMs: 4000 } receives undefined.
6. Leave scripts/project-map-access.ts and scripts/map-replay.ts unchanged. On stale they now exit through the existing catch with 'a newer projection already won', which is acceptable for operator and dev tools. Do not add a raw variant, because its only consumers would be scripts.
7. Do not add projectAndAcknowledge.

**Tests.** Change map-access-projection.test.ts:358-368, which tests requireCurrentProjection directly, to assert that projectMapAccess and projectStagedMapAccess reject with ProjectionUnavailableError on a stale door response. Flip map-access-projection.test.ts:499-500 from resolves stale to rejects. Add a map-creation.test.ts case: the first ladder attempt resolves stale, then the ladder retries and publishes only after an applied attempt, and publish is not called after the stale attempt. Update map-access-update.test.ts:16-26 and map-lifecycle.test.ts:105-116 to use a rejecting double; the lifecycle case then duplicates the rejection test above it at ~95-103, so delete it. Also update map-creation.test.ts:145-151, map-purge.test.ts:208-214, map-affiliation-access.test.ts:73-82 (the 'stale' variant becomes a ProjectionUnavailableError rejection) and tracking-merge-retry.db.test.ts:15-19.

**Notes.** Behaviour change to preserve deliberately: map-creation's staged projection now treats 'stale' as a failed attempt and retries on the existing ladder. That is the correct direction. A stale result there can only come from an external projection with a higher revision, either projectMapAccess with allowArchived=false (archived staged map -> [] claims, map-access-projection.ts:150) or a teardown. The current code then publishes a map whose Convex claims are empty, and nothing re-queues it. Failure mapping stays at the call sites: map-access-update returns { ok:false, reason:'projection-unavailable', cause }, while map-lifecycle logs the label and returns { ok:true, projectionPending:true }. Keep map-lifecycle's comment 'Project current state, not the captured write'. Unrelated cleanup lead in map-purge.ts: `const projectionPending = 0` (line 61) is always 0, and `if (purge.remaining)` (65-70) is unreachable because the schema is z.literal(false). projectionPending is part of data/maps/api-contract.ts:232, so changing it is a contract decision.

<sub>Reported by: area:composition.</sub>

<a id="p322"></a>

## P322: Drop the constant projectionPending, the outer teardown currency checks, and the affiliation/transfer pass-through wrappers

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -45 / +8 (production about -20, tests about -30 counting the stale doubles; type narrowing about +4)
- **Depends on:** [P164](#p164)
- **Existing primitive:** `src/platform/auth/affiliation-store.ts:getUsersAffiliations; src/composition/account-lifecycle/account-purge.ts:transferCharacter`

**Problem.** The map purge cron reports `projectionPending: 0` on every run, and that field sits in its API contract and telemetry. Map purge and map creation re-apply requireCurrentProjection to teardown results that teardown has already checked. map-character-scoping reads affiliations through a renamed alias of getUsersAffiliations and groups them by user with its own loop, alongside groupByUser. owner-transfer exports a wrapper that only forwards to transferCharacter.

**Verifier revision.** The core is real. purgeEligibleMaps declares `const projectionPending = 0` and never changes it: every teardown failure throws MapPurgeUnavailableError. The 0 still reaches the cron body and usage telemetry through declaration.ts:19-27. teardownMapAccessProjection already wraps its result in requireCurrentProjection (map-access-projection.ts:269), and synthetic-pilot-store.ts:90 already calls it with no outer check, so the outer checks in map-purge and map-creation are redundant for the real implementation. readAccountAffiliations is a one-line alias of getUsersAffiliations, and purgeTransferredCharacter only forwards to transferCharacter. The design changes in one way. Deleting the outer checks alone would let an injected `teardown` double return 'stale' unchecked, because the `typeof teardownMapAccessProjection` dependency type still allows 'stale'. So the guarantee should move into the return type rather than be dropped. I also found one more same-concept site: map-character-scoping's eligibleByUser re-implements groupByUser on the same affiliation rows. The other requireCurrentProjection callers (map-lifecycle, map-access-update, map-affiliation-access, tracking-merge-retry) are not redundant, because projectMapAccess returns 'stale' through unchanged.

**Sites (15).**

- [`src/composition/map-purge.ts:2-5, 47-52, 61, 71-78, 88`](../../src/composition/map-purge.ts#L2-L5) — requireCurrentProjection import; return type field; const projectionPending = 0; outer requireCurrentProjection inside the try that converts failures to MapPurgeUnavailableError; constant in the return
- [`src/data/maps/api-contract.ts:225-233`](../../src/data/maps/api-contract.ts#L225-L233) — CronPurgeMapsResponse carries projectionPending: number (line 232)
- [`src/app/api/cron/purge-maps/declaration.ts:19-27`](../../src/app/api/cron/purge-maps/declaration.ts#L19-L27) — Spreads the result into the cron body and usage telemetry, so the 0 is emitted on every run
- [`src/composition/map-creation.ts:3, 24, 146, 161-172`](../../src/composition/map-creation.ts#L3) — Outer requireCurrentProjection(await teardown(mapId)) at 162; Teardown = typeof teardownMapAccessProjection
- [`src/composition/map-access-projection.ts:62-69, 90-95, 105-115, 267-274`](../../src/composition/map-access-projection.ts#L62-L69) — requireCurrentProjection; AccountAffiliation type and the readAccountAffiliations alias; groupByUser; teardown already applies requireCurrentProjection
- [`src/composition/synthetic-pilot-store.ts:88-91`](../../src/composition/synthetic-pilot-store.ts#L88-L91) — Third teardown caller, which already relies on the internal check with no outer wrapper
- [`src/composition/map-character-scoping.ts:14-21, 54-58, 90, 129`](../../src/composition/map-character-scoping.ts#L14-L21) — Imports readAccountAffiliations; eligibleByUser groups AccountAffiliation rows by userId with a spread-per-row loop that duplicates groupByUser; dependency type and default
- [`src/composition/account-lifecycle/owner-transfer.ts:10, 101-103, 109-115`](../../src/composition/account-lifecycle/owner-transfer.ts#L10) — purgeTransferredCharacter only awaits transferCharacter
- [`src/composition/account-lifecycle/account-purge.ts:93-100`](../../src/composition/account-lifecycle/account-purge.ts#L93-L100) — transferCharacter, the real primitive
- [`src/composition/map-purge.test.ts:80-85, 111-116, 172-177, 201-219`](../../src/composition/map-purge.test.ts#L80-L85) — projectionPending: 0 in three toEqual assertions; injected 'stale' teardown double
- [`src/composition/map-creation.test.ts:139-157`](../../src/composition/map-creation.test.ts#L139-L157) — Injected 'stale' teardown double expecting cleanup 'queued'
- [`src/app/api/cron/purge-maps/route.test.ts:32-37, 63-70`](../../src/app/api/cron/purge-maps/route.test.ts#L32-L37) — projectionPending: 0 in the mock and the response assertion
- [`src/composition/account-lifecycle/owner-transfer.test.ts:57-63, 91, 124-160`](../../src/composition/account-lifecycle/owner-transfer.test.ts#L57-L63) — The account-purge mock forwards transferCharacter to finishCharacterTransfer(…, accountRowId ?? 'acc-1'); the purgeTransferredCharacter describe block really unit-tests finishCharacterTransfer
- [`src/composition/account-lifecycle/owner-transfer.db.test.ts:42, 243`](../../src/composition/account-lifecycle/owner-transfer.db.test.ts#L42) — Calls purgeTransferredCharacter directly
- [`src/composition/map-access-projection.test.ts:273-284`](../../src/composition/map-access-projection.test.ts#L273-L284) — Already proves teardown rejects a 'stale' delivery at the source

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/map-lifecycle.ts:15-17, 40-50`](../../src/composition/map-lifecycle.ts#L15-L17) — Its projectionPending is a live boolean, true when ProjectionUnavailableError is caught. Leave it as is.
- [`src/composition/map-lifecycle.ts:41-43`](../../src/composition/map-lifecycle.ts#L41-L43) — requireCurrentProjection on projectMapAccess is needed: projectMapAccessState (234-251) returns 'stale' through requireScopedDelivery without throwing
- [`src/composition/map-access-update.ts:73`](../../src/composition/map-access-update.ts#L73) — Same: it guards projectMapAccess, not teardown
- [`src/composition/map-affiliation-access.ts:47`](../../src/composition/map-affiliation-access.ts#L47) — Same: it guards projectMapAccess
- [`src/composition/account-lifecycle/tracking-merge-retry.ts:38`](../../src/composition/account-lifecycle/tracking-merge-retry.ts#L38) — Same: it guards projectMapAccess

</details>

**Home.** `src/composition/map-access-projection.ts (narrowed CurrentProjectionResult type, exported groupByUser); existing primitives src/platform/auth/affiliation-store.ts:getUsersAffiliations and src/composition/account-lifecycle/account-purge.ts:transferCharacter`

**Boundary check.** All production edits are in the composition zone (src/composition/**) plus data/maps (src/data/maps/api-contract.ts). The new imports are composition→platform/auth (map-character-scoping importing getUsersAffiliations; the rule from 'composition' allows 'platform/auth', and map-access-projection.ts:18 already makes this import) and composition→composition (groupByUser from ./map-access-projection, which map-character-scoping already imports; transferCharacter from ./account-purge, which owner-transfer.ts:10 already imports). api-contract stays in data. The api-zone route only consumes the type, and api→data is allowed. No new cross-zone edges.

**API sketch.**

```ts
// map-access-projection.ts
export type CurrentProjectionResult = ProjectionResult & { readonly outcome: 'applied' | 'duplicate' };
export function requireCurrentProjection(result: ProjectionResult): CurrentProjectionResult; // after the stale throw: return { ...result, outcome: result.outcome }
export async function teardownMapAccessProjection(mapId: string): Promise<CurrentProjectionResult>;
export function groupByUser(rows: readonly AccountAffiliation[]): Map<string, CachedAffiliation[]>;
// map-purge.ts
export async function purgeEligibleMaps(deps?: MapPurgeDependencies): Promise<{ readonly selected: number; readonly tombstoned: number; readonly deletedDocuments: number }>;
// api-contract.ts
export type CronPurgeMapsResponse = { readonly status: 'busy' } | { readonly status: 'purged'; readonly selected: number; readonly tombstoned: number; readonly deletedDocuments: number };
// map-character-scoping.ts
readonly readAffiliations?: typeof getUsersAffiliations;
```

**Migration steps.**

1. In map-access-projection.ts, add CurrentProjectionResult. Make requireCurrentProjection return it: after the stale throw, return `{ ...result, outcome: result.outcome }` so TypeScript narrows without a cast. Give teardownMapAccessProjection the return type Promise<CurrentProjectionResult>.
2. In map-purge.ts, remove the requireCurrentProjection import and replace line 72 with `await teardownAccess(map.id);`, keeping it inside the existing try/catch that wraps any rejection in MapPurgeUnavailableError. Delete projectionPending from the return type (51), the const (61) and the return (88).
3. In api-contract.ts, delete projectionPending (232) from CronPurgeMapsResponse. declaration.ts needs no change because it spreads the result.
4. In map-creation.ts, replace line 162 with `await teardown(mapId);` inside the same try, and drop the requireCurrentProjection import.
5. Tests: map-purge.test.ts drops projectionPending from the toEqual at 80-85, 111-116 and 172-177, and drops the 'stale' half of the test at 201-219 (the injected double no longer typechecks). Keep the rejected-teardown half and rename the test. map-creation.test.ts drops the 'stale' case at 139-157 and keeps the rejected case. route.test.ts drops projectionPending at 36 and 69. Stale-at-source coverage stays in map-access-projection.test.ts:273-284.
6. Delete readAccountAffiliations (map-access-projection.ts:92-95) and keep the AccountAffiliation type. In map-character-scoping.ts, import getUsersAffiliations from '@/platform/auth/affiliation-store' and use it at lines 90 and 129. The tests inject readAffiliations doubles, so they stay unchanged.
7. Export groupByUser (map-access-projection.ts:105-115), typed with AccountAffiliation, and rewrite eligibleByUser (map-character-scoping.ts:54-58) as `new Map([...groupByUser(affiliations)].map(([userId, held]) => [userId, new Set(eligibleCharacterIds(grants, held))]))`.
8. In owner-transfer.ts, call transferCharacter(row.userId, proof.characterId, row.id) at line 102 and delete purgeTransferredCharacter (109-115).
9. In owner-transfer.test.ts, rename describe('purgeTransferredCharacter') to 'finishCharacterTransfer' and call `finishCharacterTransfer(USER, CHAR, 'acc-1')` imported from './character-transfer'. The account-purge mock passes 'acc-1' by default, so this is equivalent. Keep the mock for proveCharacter. In owner-transfer.db.test.ts:243, call transferCharacter from './account-purge', which the db test does not mock.

**Tests.** Update map-purge.test.ts, map-creation.test.ts, cron purge-maps route.test.ts, owner-transfer.test.ts and owner-transfer.db.test.ts as described in the steps. Existing guards: map-access-projection.test.ts:273-284 (teardown rejects stale); map-character-scoping.test.ts:63-151 (the readAffiliations seam and grandfather selection, which covers the groupByUser reuse); map-purge.test.ts ordering tests (purge → teardown → tombstone); map-creation.test.ts teardown-rejection → cleanup 'queued'. To pin the narrowed type, add an expect-type assertion in map-access-projection.test.ts that teardownMapAccessProjection's resolved outcome excludes 'stale'.

**Notes.** Behavior to preserve: in map-purge, a teardown rejection must still become MapPurgeUnavailableError with the map id, and the tombstone must not run (keep the try/catch). In map-creation, a teardown rejection must still return cleanup 'queued' without compensating. The cron response and usage metadata lose the projectionPending key. Nothing in the repo reads it (grep shows only tests); confirm no external dashboard keys on cron_map_purge.projectionPending before landing. Do not touch map-lifecycle's projectionPending boolean or the requireCurrentProjection calls on projectMapAccess results. groupByUser and eligibleByUser both group in first-occurrence order and keep row order within a user, so the reuse keeps behavior; the old spread-per-row loop was O(n^2) but negligible at realistic sizes.

<sub>Reported by: area:composition.</sub>

<a id="p165"></a>

## P165: Share one sequential deadline runner for the housekeeping retry loops

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** +30 lib and +60 test; about -35 across the four loops and the housekeeping adapters
- **Depends on:** [P164](#p164)
- **Existing primitive:** `src/lib/fan-out.ts:runBounded (sibling home)`

**Problem.** Housekeeping and the nightly net-worth cron each hand-roll the same loop: `for (item) { if (Date.now() >= deadline) break; try { work; ok++ } catch { failed++; log; rotate? } }`. The four copies return four result shapes. housekeeping.ts reshapes two of them through lambdas, and its retry results cannot say that the deadline cut work short, although its delete results carry `finished` and the net-worth cron reports `deferred`. reconcileTrackingMerges cannot be budgeted by its callers because its 20s deadline is a literal.

**Verifier revision.** Four loops really are the same concept: a sequential, deadline-bounded batch with per-item failure isolation and counting. They are account-purge.retryRequestedDeletions, tracking-merge-retry.reconcileTrackingMerges, map-character-scoping.scopeLegacyMaps and net-worth-nightly.revalueAllNetWorth. They have drifted: the result shapes are {retried}, {processed}, {succeeded} and {revalued, deferred}; only net-worth reports deferred work; and tracking-merge hard-codes its 20s deadline while the others take one. The scope must shrink. map-purge.purgeEligibleMaps is fail-fast: it throws MapPurgeUnavailableError on the first failure and must stop before tombstoning, so it is a different concept. map-affiliation-access is a 4-worker concurrent pool with shrinking per-item timeouts and one batched ack, so it belongs with a bounded-concurrency primitive beside character-authorization.ts:36-49. The proposal's existing primitive, src/lib/fan-out.ts:runBounded, does not exist; fan-out.ts exports only mapByIdDroppingNulls. The merged P238 durable-queue drain is rejected. Delete-on-success happens inside each job's own transaction (account-purge.ts:66 and tracking-merge-retry.ts:41), and map-access acknowledges with one batched delete-plus-rotate statement (affiliation-store.ts:206-227). A generic drain with a separate delete step would break that atomicity.

**Sites (7).**

- [`src/composition/account-lifecycle/account-purge.ts:117-136`](../../src/composition/account-lifecycle/account-purge.ts#L117-L136) — retryRequestedDeletions: pre-check, loop, counts only defined results as retried, on error logs and calls rotateDeletionJob; returns {retried, failed}
- [`src/composition/account-lifecycle/tracking-merge-retry.ts:45-69`](../../src/composition/account-lifecycle/tracking-merge-retry.ts#L45-L69) — reconcileTrackingMerges: hard-coded 20_000 deadline; on error logs and bumps queuedAt with new Date(); returns {processed, failed}
- [`src/composition/map-character-scoping.ts:157-174`](../../src/composition/map-character-scoping.ts#L157-L174) — scopeLegacyMaps: work returns boolean (false counts as failed without throwing); log only, no rotation; returns {succeeded, failed}
- [`src/composition/board/net-worth-nightly.ts:26-43`](../../src/composition/board/net-worth-nightly.ts#L26-L43) — revalueAllNetWorth: the only copy that counts deferred; JSON log; returns {accounts, revalued, failed, deferred}
- [`src/composition/pipelines/housekeeping.ts:131-165`](../../src/composition/pipelines/housekeeping.ts#L131-L165) — runRetry and the adapter lambdas reshaping {retried} and {processed} into {succeeded}; reconcileTrackingMerges is called with no budget
- [`src/app/api/cron/revalue-net-worth/declaration.ts:21-24`](../../src/app/api/cron/revalue-net-worth/declaration.ts#L21-L24) — cron contract consumes revalued, failed and deferred
- [`src/composition/account-lifecycle/account-merge.ts:130-134`](../../src/composition/account-lifecycle/account-merge.ts#L130-L134) — settleConvexAfterMerge calls reconcileTrackingMerges(survivorUserId) on the merge path under the same fixed 20s deadline

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/map-purge.ts:53-88`](../../src/composition/map-purge.ts#L53-L88) — fail-fast: throws on the first chain, fence or tombstone failure and keeps no failed count; a tombstone pipeline must stop
- [`src/composition/map-affiliation-access.ts:33-60`](../../src/composition/map-affiliation-access.ts#L33-L60) — 4-way concurrent pool, per-item timeout min(4000, remaining - 1000 reserve), one batched ack/retry; belongs to a bounded-concurrency primitive
- [`src/composition/character-authorization.ts:36-49`](../../src/composition/character-authorization.ts#L36-L49) — same concurrent-pool shape as map-affiliation-access (lead for a runBounded-with-deadline opportunity), not a sequential loop
- [`src/composition/account-lifecycle/tracking-receipt-retention.ts:7-28`](../../src/composition/account-lifecycle/tracking-receipt-retention.ts#L7-L28) — cursor-paginated Convex deletes returning BatchedDeleteResult, not per-item work
- [`src/lib/batched-delete.ts:21-38`](../../src/lib/batched-delete.ts#L21-L38) — deadline-bounded batch DELETE; already a shared primitive with its own result type
- [`src/platform/auth/deletion-jobs.ts:88-104`](../../src/platform/auth/deletion-jobs.ts#L88-L104) — P238 queue read and rotate; delete-on-success happens inside finishDeletionJob's transaction (account-purge.ts:56-68), so a generic drain cannot own it
- [`src/data/location-tracking/merge-store.ts:22-27`](../../src/data/location-tracking/merge-store.ts#L22-L27) — P238 fixed .limit(10) read; deletion happens inside deliverTrackingMerge's transaction (tracking-merge-retry.ts:21-42)
- [`src/platform/auth/affiliation-store.ts:191-227`](../../src/platform/auth/affiliation-store.ts#L191-L227) — P238 range-checked read plus batched delete and clock_timestamp() rotate in one statement; incompatible with a per-item drain

</details>

**Home.** `src/lib/deadline-batch.ts (new; the cited src/lib/fan-out.ts:runBounded does not exist)`

**Boundary check.** The lib zone (src/lib/**) may import only config ({from: lib, allow: [config]}), and the runner imports nothing. Every consumer is in the composition zone (src/composition/account-lifecycle, map-character-scoping.ts, board/net-worth-nightly.ts, pipelines/housekeeping.ts), and {from: composition, allow: [..., lib, ...]} permits it. Fallow coverage requireAllFiles needs a sibling test file.

**API sketch.**

```ts
export type DeadlineItemOutcome = 'succeeded' | 'failed' | 'skipped';
export interface DeadlineBatchResult { readonly succeeded: number; readonly failed: number; readonly deferred: number }
export async function runUntilDeadline<T>(
  items: readonly T[],
  deadline: number,
  work: (item: T) => Promise<DeadlineItemOutcome | void>, // void = succeeded
  onError: (item: T, error: unknown) => void | Promise<void>, // awaited; its own throw propagates
  now: () => number = Date.now,
): Promise<DeadlineBatchResult>;
```

**Migration steps.**

1. Add src/lib/deadline-batch.ts and src/lib/deadline-batch.test.ts. Before each item, if now() >= deadline, set deferred = items.length - index and stop. A 'failed' result increments failed without calling onError. 'skipped' increments nothing. A throw increments failed and then awaits onError.
2. Migrate net-worth-nightly.ts first, since it already has deferred. Keep rotateByDay and the JSON log in onError, and map the result to { accounts, revalued: succeeded, failed, deferred }. The cron contract is unchanged.
3. Migrate map-character-scoping.scopeLegacyMaps. Map work to `(await scopeLegacyMap(id, deps)) ? 'succeeded' : 'failed'`; onError logs '[map-character-scoping] map kept for retry'. Return the runner result, which adds deferred.
4. Migrate account-purge.retryRequestedDeletions. Keep the pre-check before enqueueing at line 118. Work is `(await finishDeletionJob(job.id)) === undefined ? 'skipped' : 'succeeded'`; onError logs and awaits rotateDeletionJob. Return { succeeded, failed, deferred } and update the account-purge tests.
5. Migrate tracking-merge-retry.reconcileTrackingMerges. Change its signature to an options object { userId?, database?, deadline? }, defaulting the deadline to Date.now() + MAP_ACCESS_RECONCILE_BUDGET_MS (P164) or a local named constant. onError logs and rotates through `writer`. Return the runner result, and update account-merge.ts:133 and map-affiliation-access.ts:17 to the new signature.
6. In housekeeping.ts, delete the two adapter lambdas (155-162) and pass the functions straight to runRetry. Add a TRACKING_MERGE_BUDGET_MS that housekeeping passes in. Add `deferred` to HousekeepingRetryResult, mirroring HousekeepingDeleteResult.finished. Decide explicitly whether deferred > 0 marks the run 'partial': net-worth does, and housekeeping deletes do not.
7. Optional one-liners from the P238 review, without a primitive: rotate with sql`clock_timestamp()` in deletion-jobs.ts:103 and tracking-merge-retry.ts:64, matching affiliation-store.ts:217 and the defaultNow() insert clock.

**Tests.** New src/lib/deadline-batch.test.ts. Cover: deadline already passed (everything deferred, work never called); a cut mid-run (exact deferred count); a 'failed' result does not call onError; 'skipped' is not counted; a throw counts as failed and awaits onError; a throw from onError propagates; the `now` injection. Existing guards to update or keep green: account-purge.test.ts:44,51; account-purge.db.test.ts:510,545,612,676 ({retried} becomes {succeeded, deferred}); tracking-merge-retry.db.test.ts:61-67,99 ({processed} becomes {succeeded}); map-character-scoping.test.ts and .db.test.ts; net-worth-nightly.test.ts; housekeeping.test.ts:68-69,83,123,167 and housekeeping.db.test.ts.

**Notes.** Behaviours to preserve. account-purge counts a job that vanished (finishDeletionJob returns undefined) as neither success nor failure, and checks the deadline before enqueueing discovered requests. tracking-merge rotates through the injected writer so DB tests stay on their harness. scopeLegacyMap can report failure without throwing. net-worth logs JSON and rotates its start index daily. In every site a failing rotate aborts the run, so onError must propagate. Drift found: (1) reconcileTrackingMerges' literal 20s deadline cannot be budgeted by housekeeping and also runs inside reconcileAffiliationAccess before that function's own 20s delivery budget (map-affiliation-access.ts:16-19), so one reconcile can take about 40s. (2) Housekeeping retries cannot report deferred work. (3) listUnscopedMapIds orders by id with no rotation (data/maps/character-scoping.ts:28-36), so a map that keeps failing before it is stamped stays at the head of every 50-map batch; this is a starvation lead and the runner does not fix it. If a separate bounded-concurrency primitive lands in src/lib/fan-out.ts, put this runner beside it and consider a `concurrency` option for map-affiliation-access and character-authorization; do not fold them in now.

<sub>Reported by: area:composition, concern:persistence.</sub>

<a id="p166"></a>

## P166: Route every owned-map chain purge through one composition helper

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -14 / +8
- **Depends on:** —
- **Existing primitive:** `src/data/maps/queries.ts:getOwnedMapIds`

**Problem.** Three code paths purge a user's owned Convex map chains with their own loop. The maps purge contributor uses getOwnedMapIds with an injected purgeMapChain. The identity runner's runBeforeUserDelete uses getOwnedMapIds with purgeMapChain. The synthetic pilot reset re-implements getOwnedMapIds with a raw `db.select({ id: maps.id }).from(maps).where(eq(maps.userId, ...))` query.

**Verifier revision.** The loop really is copied three times, but it is only 3-4 lines, and the steps around it legitimately differ, so the proposed options bag ({ teardownAccess?, trackingMode }) would cost more than it saves. The location-tracking difference is not part of the loop: teardownLocationTracking cancels pending merges in the DB and then calls purgeLocationTracking, a choice each caller can make on its own line. What survives is one composition helper that owns 'getOwnedMapIds then purgeMapChain'. The data contributor receives it through the existing hooks seam in place of purgeMapChain, and the synthetic reset stops bypassing getOwnedMapIds with a raw drizzle query. The drift the finders noted is real, but it should not be resolved by moving the steps into the helper. forgetMapBlockAccounts must not run in the identity path, as explained in the notes.

**Sites (7).**

- [`src/data/maps/purge.ts:30-39, 119-125`](../../src/data/maps/purge.ts#L30-L39) — purgeOwnedMapChainsThenDeleteMaps, called by the contributor's purgeUser; the hook is purgeMapChain
- [`src/data/maps/purge.ts:18-24`](../../src/data/maps/purge.ts#L18-L24) — MapAccessProjectionPurgeHooks, the existing injection seam
- [`src/composition/purge/register-all.ts:27-31`](../../src/composition/purge/register-all.ts#L27-L31) — hook wiring in composition
- [`src/composition/map-access-identity.ts:37-46`](../../src/composition/map-access-identity.ts#L37-L46) — teardownProjectionsForDeletedUser: getOwnedMapIds plus purgeMapChain loop, bestEffort user-claim purge, teardownLocationTracking
- [`src/composition/synthetic-pilot-store.ts:83-94`](../../src/composition/synthetic-pilot-store.ts#L83-L94) — raw owned-maps query, then purgeMapChain and teardownMapAccessProjection per map, non-best-effort claim purge, purgeLocationTracking
- [`src/data/maps/queries.ts:636-645`](../../src/data/maps/queries.ts#L636-L645) — existing getOwnedMapIds
- [`src/composition/map-purge.ts:26-36`](../../src/composition/map-purge.ts#L26-L36) — purgeMapChain, the natural home for the helper

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/map-purge.ts:63-87`](../../src/composition/map-purge.ts#L63-L87) — purgeEligibleMaps loops over claimed purgeable maps, not a user's owned maps, and is fail-fast with tombstoning
- [`src/data/location-tracking/purge.ts:7-28`](../../src/data/location-tracking/purge.ts#L7-L28) — purgeLocationTracking and teardownLocationTracking are a separate step that each caller chooses; they do not belong in the helper

</details>

**Home.** `src/composition/map-purge.ts (beside purgeMapChain)`

**Boundary check.** The helper lives in composition and imports getOwnedMapIds from data/maps/queries, which {from: composition, allow: [..., data, ...]} permits. Its direct consumers, map-access-identity.ts and synthetic-pilot-store.ts, are in composition, so the imports are intra-zone. data/maps/purge.ts is in data and may not import composition (the data rule lists no composition), so it receives the helper through MapAccessProjectionPurgeHooks, wired in composition/purge/register-all.ts as purgeMapChain is today. There is no cycle: map-purge.ts imports only map-access-projection, data/maps/lifecycle, data/maps/queries and lib.

**API sketch.**

```ts
// src/composition/map-purge.ts
/** Purges every Convex chain the user owns, in order; returns the purged map ids. */
export async function purgeOwnedMapChains(userId: string): Promise<string[]>;
// src/data/maps/purge.ts
export interface MapAccessProjectionPurgeHooks {
  readonly deliverCaptured: (changes: PendingMapAccessChange[]) => Promise<unknown>;
  readonly purgeOwnedMapChains: (userId: string) => Promise<unknown>; // replaces purgeMapChain
  readonly purgeUserClaims: (userId: string) => Promise<unknown>;
}
```

**Migration steps.**

1. Add purgeOwnedMapChains(userId) to src/composition/map-purge.ts. It calls getOwnedMapIds(userId) and awaits purgeMapChain(id) for each id sequentially, which keeps the Convex batch limits, and returns the ids.
2. In map-access-identity.ts:37-41, replace the loop with `await purgeOwnedMapChains(userId)` and drop the getOwnedMapIds import. Keep the bestEffort claim purge and teardownLocationTracking as they are.
3. In synthetic-pilot-store.ts:84-91, replace the raw query and loop with `for (const id of await purgeOwnedMapChains(SYNTHETIC_PILOT.userId)) await teardownMapAccessProjection(id);`. Drop the now-unused `maps` import. Keep the non-best-effort purgeUserMapAccessProjection and purgeLocationTracking, and the NEXT_PUBLIC_CONVEX_URL guard.
4. In data/maps/purge.ts, rename the hook purgeMapChain to purgeOwnedMapChains. In purgeUser, call `await hooks.purgeOwnedMapChains(userId); await deleteOwnedMaps(userId);`. Delete purgeOwnedMapChainsThenDeleteMaps and the getOwnedMapIds import.
5. In composition/purge/register-all.ts:27-31, pass purgeOwnedMapChains instead of purgeMapChain.

**Tests.** Add a map-purge.test.ts case: purgeOwnedMapChains purges each owned id in order and returns them, and a failing purge rejects without continuing. Update map-access-identity.test.ts:8-10,33,47,112-115,195 to mock map-purge.purgeOwnedMapChains instead of getOwnedMapIds plus purgeMapChain. Update the hooks in data/maps/purge.db.test.ts. Keep synthetic-pilot-store.test.ts:60 (teardown mock) and synthetic-pilot-store.db.test.ts green. account-purge.db.test.ts exercises the real contributor and must stay green.

**Notes.** Differences the migration keeps at the call sites. The contributor deletes map rows, forgets block accounts, and purges claims best-effort. The identity runner relies on the FK cascade from deleteUserIfUnlinked, purges claims best-effort and calls teardownLocationTracking. The synthetic reset is non-best-effort, fences each map with teardownMapAccessProjection and calls purgeLocationTracking. Drift leads that need a decision, not this refactor: (1) Fence. map-purge.ts:71-78 and the synthetic reset fence each purged map with an empty-claim teardown. The two user-deletion paths do not, although /purge-map-chain deletes mapAccessProjectionWatermarks (convex/mapPurge.ts:7-18). A projection reserved before the purge and delivered after it could therefore re-apply claims for a deleted map. Making the helper fence would add one Convex call per owned map and needs a test. (2) Blocks. The identity path never nulls map_blocks.blocked_by_user_id, a column with no FK (data/maps/schema.ts:95), while the contributor's forgetMapBlockAccounts does. Do not move forgetMapBlockAccounts into runBeforeUserDelete: deleteUserIfUnlinked can return false and loop (platform/auth/account-purge.ts:47-50), and forgetting map_block_accounts for a user who survives would lift their block. If the dangling id matters, null it inside deleteUserIfUnlinked's locked transaction.

<sub>Reported by: area:composition.</sub>

<a id="p240"></a>

## P240: Generate the single-table purge contributors from one table list in src/platform/purge

- **Status:** [ ] not started
- **Category:** persistence · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -75 / +45 production; +60 tests
- **Depends on:** —
- **Existing primitive:** `src/platform/purge/types.ts:PurgeContributor; src/platform/purge/merge.ts:userKeyColumn`

**Problem.** Most PurgeContributors spell out the same table list three times: claims, merge rules, and the delete body. Eight cache-tier contributors follow 'claims [T...], follows-character, delete by characterId or by ownerType=character plus ownerId'. Four durable contributors follow 'claims [T], rekey or survivor-wins, delete by userId'. A table can be claimed and given a merge rule but left out of the delete, and no registry test would notice: findMergeRuleGaps and findUnclaimed cover only claims and merge rules.

**Verifier revision.** The factory is justified. 12 contributors follow two templates: character-keyed cache rows (8) and user-keyed durable rows (4). Fallow near-duplicate groups at dupes-grouped.txt:376-455 confirm this. Existing tests keep claims and merge rules in step (findMergeRuleGaps, findUnclaimed), but nothing checks that purgeCharacter or purgeUser actually deletes every claimed table, and orchestrator.test.ts checks only a sample of tables. Deriving claims, merge rules and deletes from one list removes that gap. Two changes to the proposal. (1) Drop the Convex `skipWhenUnconfigured` part. There are only two sites and their contracts differ: location-tracking cancels Neon pending merges first and exports an unguarded purgeLocationTracking used by tracking-merge-retry.ts:36 and synthetic-pilot-store.ts:93. postConvexHttpDoor<T> would also have to change its return type to T | undefined. The 'maps drift' is not drift: the maps contributor calls injected hooks, and purgeMapChain throwing keeps the deletion requested instead of deleting Neon map rows whose Convex chain still exists. (2) Derive the durable user key with the existing userKeyColumn, so the delete and the rekey/survivor-wins merge always use the same column.

**Sites (17).**

- [`src/platform/purge/types.ts:22-45`](../../src/platform/purge/types.ts#L22-L45) — PurgeContributor, TableMergeRule, and MergeTx (PgDatabase<any,any,any>), a database type available inside the zone
- [`src/platform/purge/merge.ts:5-28`](../../src/platform/purge/merge.ts#L5-L28) — userKeyColumn and requireUserKey already discover user_id for rekey and discard
- [`src/platform/purge/__tests__/coverage.ts:228-242`](../../src/platform/purge/__tests__/coverage.ts#L228-L242) — findMergeRuleGaps checks claims against merge rules only, not the deletes
- [`src/platform/auth/corp-roles-purge.ts:6-14`](../../src/platform/auth/corp-roles-purge.ts#L6-L14) — characterId template
- [`src/features/character-sheet/purge.ts:6-14`](../../src/features/character-sheet/purge.ts#L6-L14) — characterId template
- [`src/features/skill-queue/purge.ts:6-18`](../../src/features/skill-queue/purge.ts#L6-L18) — characterId template, two tables, skills then syncs
- [`src/data/telemetry/purge.ts:6-14`](../../src/data/telemetry/purge.ts#L6-L14) — characterId template
- [`src/data/corp-holdings/purge.ts:6-14`](../../src/data/corp-holdings/purge.ts#L6-L14) — characterId template
- [`src/features/owned-assets/purge.ts:6-24`](../../src/features/owned-assets/purge.ts#L6-L24) — owner-keyed template, assets then syncs
- [`src/features/owned-blueprints/purge.ts:6-29`](../../src/features/owned-blueprints/purge.ts#L6-L29) — owner-keyed template, same shape as owned-assets
- [`src/data/esi-snapshots/purge.ts:6-16`](../../src/data/esi-snapshots/purge.ts#L6-L16) — owner-keyed template
- [`src/features/custom-structures/purge.ts:6-14`](../../src/features/custom-structures/purge.ts#L6-L14) — rekey plus delete by userId
- [`src/features/industry-planner/purge.ts:6-26`](../../src/features/industry-planner/purge.ts#L6-L26) — two rekey plus delete-by-userId contributors
- [`src/data/preferences/purge.ts:6-14`](../../src/data/preferences/purge.ts#L6-L14) — survivor-wins on [key] plus delete by userId
- [`src/composition/purge/register-all.ts:33-53`](../../src/composition/purge/register-all.ts#L33-L53) — registry order: owned-assets runs before esi-snapshots (owned_assets.snapshot_id references esi_snapshots)
- [`src/composition/purge/orchestrator.test.ts:1-28, 72-113`](../../src/composition/purge/orchestrator.test.ts#L1-L28) — mocks @/db as a recording chain; the factory must still call database.delete(table).where(...)
- [`src/composition/purge/registry.test.ts:123-132`](../../src/composition/purge/registry.test.ts#L123-L132) — looks up contributors by name ('preferences'), so names must be kept

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-jobs/purge.ts:33-64`](../../src/features/industry-jobs/purge.ts#L33-L64) — Character half matches the template, but the contributor also has the custom corp pair merge and a purgeUser. Keep it hand-written.
- [`src/features/net-worth/purge.ts:14-25`](../../src/features/net-worth/purge.ts#L14-L25) — purgeCharacter erases whole days through a jsonb pilots check. Bespoke. It could spread userRowsContributor and add purgeCharacter, but that is optional.
- [`src/data/esi-refresh-jobs/purge.ts:6-32`](../../src/data/esi-refresh-jobs/purge.ts#L6-L32) — Discard rule plus a user-scoped character delete. Bespoke.
- [`src/data/maps/purge.ts:93-126`](../../src/data/maps/purge.ts#L93-L126) — Hook-driven, credential tier. Its throw when Convex is unresolved (composition/map-purge.ts:26-36) is intentional: the deletion stays requested.
- [`src/data/online-status/purge.ts:5-24`](../../src/data/online-status/purge.ts#L5-L24) — Convex door with env guard. Only two such sites with different contracts; not worth a flag on postConvexHttpDoor.
- [`src/data/location-tracking/purge.ts:7-37`](../../src/data/location-tracking/purge.ts#L7-L37) — Cancels Neon pending merges first; purgeLocationTracking is also used unguarded by tracking-merge-retry.ts:36 and synthetic-pilot-store.ts:93.

</details>

**Home.** `src/platform/purge/contributors.ts (new, beside types.ts and merge.ts)`

**Boundary check.** platform/purge allows importing no zones (rule from:platform/purge allow []). The factory therefore uses only drizzle-orm and its own zone files (types.ts for MergeTx and PurgeContributor, merge.ts for userKeyColumn), and receives the database as an argument. Consumers: features (from:features allows platform/purge), data (from:data allows platform/purge) and platform/auth (from:platform/auth allows platform/purge). Each consumer passes `db` from '@/db', which it already imports today.

**API sketch.**

```ts
type CharacterKeyed =
  | { readonly table: PgTable; readonly characterId: PgColumn }
  | { readonly table: PgTable; readonly ownerType: PgColumn; readonly ownerId: PgColumn };
export function characterCacheContributor(database: MergeTx, spec: {
  readonly name: string; readonly tables: readonly CharacterKeyed[];
}): PurgeContributor; // tier 'cache'; claims = tables; merge = follows-character each; purgeCharacter deletes in list order
export function userRowsContributor(database: MergeTx, spec: {
  readonly name: string; readonly table: PgTable;
  readonly merge: { readonly rule: 'rekey' } | { readonly rule: 'survivor-wins'; readonly key: readonly PgColumn[] };
}): PurgeContributor; // tier 'durable'; userId column from userKeyColumn(table), throws at load if absent; purgeUser deletes by it
```

**Migration steps.**

1. Add src/platform/purge/contributors.ts with both factories and a unit test that uses a recording fake database.
2. Migrate the characterId-keyed cache contributors: corp-roles-purge, character-sheet, skill-queue (keep skills before syncs), telemetry, corp-holdings.
3. Migrate the owner-keyed cache contributors: owned-assets (assets before syncs), owned-blueprints, esi-snapshots. Leave register-all.ts order unchanged.
4. Migrate the durable contributors: custom-structures, saved-plans, industry-profiles (rekey) and preferences (survivor-wins on userPreferences.key).
5. Keep every exported contributor name and constant name, so register-all.ts and registry.test.ts need no change.
6. Leave industry-jobs, net-worth, esi-refresh-jobs, maps, auth, online-status and location-tracking hand-written.

**Tests.** New src/platform/purge/contributors.test.ts: for each factory, claims equal the listed tables; merge rules are follows-character, or rekey/survivor-wins with the key; purgeCharacter or purgeUser issues exactly one delete per table in list order with the correct predicate (render it with PgDialect to check characterId versus ownerType='character' AND ownerId); userRowsContributor throws for a table without user_id. Existing guards: composition/purge/registry.test.ts (findUnclaimed, findMergeRuleGaps, the 'preferences' name lookup), composition/purge/orchestrator.test.ts (tier ordering and table sequence), account-merge.db.test.ts.

**Notes.** Preserve the delete order inside multi-table contributors (rows before their sync table) and the contributor order in register-all.ts. owned_assets.snapshot_id references esi_snapshots.id, so owned-assets must purge before esi-snapshots. Every templated table deletes unconditionally, with no user scoping on character rows. esi-refresh-jobs, by contrast, scopes its character delete by userId as well, which is one reason it stays bespoke. Passing `db` (a lazy Proxy) at module load is safe, and the vi.mock('@/db') chain in orchestrator.test.ts still records the deletes.

<sub>Reported by: concern:feature-skeleton, concern:persistence, dupes-triage-1.</sub>

<a id="p321"></a>

## P321: Remove valuation from the board NameBook: netWorthSnapshot takes the ValuationBook and NameIdRequest drops valuationTypeIds

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -25 / +10
- **Depends on:** —
- **Existing primitive:** `src/composition/board/price-book.ts:ValuationBook`

**Problem.** The board's name book mixes two concerns. NameBook carries prices and typeCategories that assembleBoard never reads, and resolveNameBook runs a valuation fetch whose inputs are always empty and whose unseeded result nobody reads. Only the nightly or link snapshot needs a valuation, and it must reshape ValuationBook (categories -> typeCategories) to fit NameBook. collectNameIds computes valuationTypeIds that the view immediately overwrites with [].

**Verifier revision.** Confirmed. resolveNameBook always awaits resolveValuationBook. Its only caller, getBoardForUserOnView (board-view.ts:111), passes valuationTypeIds: [] and assembles the board without reading names.prices or names.typeCategories. The only readers of those fields are pilotWorthOf and netWorthSnapshot, both through Pick<NameBook, 'prices'|'typeCategories'> (board-assemble.ts:359, 472). ResolvedNameBook.unseededTypeIds is never read. recordNetWorthSnapshot (board-view.ts:84-88) renames ValuationBook.categories to typeCategories only to fit NameBook. The dead path costs no queries: getPrices, getAveragePrices and getTypeMarketFacts all short-circuit on an empty list. So this is a type and API cleanup, not an efficiency fix. Revised design: netWorthSnapshot and pilotWorthOf take Pick<ValuationBook,'prices'|'categories'> directly. NameIdRequest also loses valuationTypeIds, which only the snapshot path reads; the view now computes and then overrides it, so a separate collectValuationTypeIds is cleaner.

**Sites (10).**

- [`src/composition/board/name-book.ts:10-15, 22-29, 43-52`](../../src/composition/board/name-book.ts#L10-L15) — ResolvedNameBook and unseededTypeIds, resolveValuationBook(request.valuationTypeIds) inside Promise.all, prices, typeCategories and unseededTypeIds in the return value
- [`src/composition/board/board-view.ts:79-91`](../../src/composition/board/board-view.ts#L79-L91) — recordNetWorthSnapshot maps categories to typeCategories and reads valuationTypeIds via collectNameIds
- [`src/composition/board/board-view.ts:106-115`](../../src/composition/board/board-view.ts#L106-L115) — The view passes valuationTypeIds: [] and never reads prices
- [`src/composition/board/board-assemble.ts:79-96`](../../src/composition/board/board-assemble.ts#L79-L96) — NameBook.prices, NameBook.typeCategories and NameIdRequest.valuationTypeIds
- [`src/composition/board/board-assemble.ts:145-185`](../../src/composition/board/board-assemble.ts#L145-L185) — valuationTypeIdsOf and collectNameIds gather valuationTypeIds together with the name ids
- [`src/composition/board/board-assemble.ts:358-375, 471-490`](../../src/composition/board/board-assemble.ts#L358-L375) — pilotWorthOf and netWorthSnapshot are the only readers, through Pick<NameBook,'prices'\|'typeCategories'>
- [`src/composition/board/price-book.ts:10-15, 27-47`](../../src/composition/board/price-book.ts#L10-L15) — ValuationBook { prices, categories, unseeded }; returns empty maps for empty input
- [`src/composition/board/demo-board.ts:251, 272-299, 860, 889`](../../src/composition/board/demo-board.ts#L251) — DEMO_NAMES carries DEMO_PRICES and DEMO_CATEGORIES only for netWorthSnapshot at 860; assembleBoard at 889 ignores them
- [`src/composition/board/board-assemble.test.ts:77-98, 130-146, 369, 425-450, 455`](../../src/composition/board/board-assemble.test.ts#L77-L98) — The NAMES fixture mixes names and prices; the collectNameIds tests assert valuationTypeIds; snapshot tests pass NAMES
- [`src/data/market-prices/queries.ts:24-31`](../../src/data/market-prices/queries.ts#L24-L31) — getPrices short-circuits on [], as do getAveragePrices and getTypeMarketFacts, so the dead path makes no DB calls

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/board/price-book.ts:49-51`](../../src/composition/board/price-book.ts#L49-L51) — seedUnpricedTypes is live; recordNetWorthSnapshot uses ValuationBook.unseeded

</details>

**Home.** `src/composition/board (board-assemble.ts, name-book.ts, board-view.ts, demo-board.ts). ValuationBook in price-book.ts is the existing type to adopt.`

**Boundary check.** All files are in the composition zone (src/composition/**), so the edits are same-zone. board-assemble.ts gains `import type { ValuationBook } from './price-book'`. That import is type-only and erased at runtime, so the pure board-assemble and demo-board modules do not pull in price-book's '@/db' import. price-book does not import board-assemble, so no cycle forms.

**API sketch.**

```ts
// board-assemble.ts
export type Valuation = Pick<ValuationBook, 'prices' | 'categories'>;
export interface NameBook { types; systems; npcStations; entities; skillCatalog } // no prices/typeCategories
export interface NameIdRequest { typeIds; systemIds; stationIds; entityIds } // no valuationTypeIds
export function collectValuationTypeIds(raws: readonly BoardRaw[]): number[]; // sorted, de-duplicated
export function netWorthSnapshot(raws: readonly BoardRaw[], valuation: Valuation, day: string): NetWorthDay;
// name-book.ts
export async function resolveNameBook(request: NameIdRequest): Promise<NameBook>;
```

**Migration steps.**

1. board-assemble.ts: add `import type { ValuationBook } from './price-book'` and a Valuation alias. Change the pilotWorthOf (359) and netWorthSnapshot (472) parameters to valuation: Valuation, and pass valuation.prices and valuation.categories to valueCharacter.
2. board-assemble.ts: remove prices and typeCategories from NameBook (85-86), and drop the PriceBook and TypeCategories imports if nothing else uses them.
3. board-assemble.ts: remove valuationTypeIds from NameIdRequest (94-95) and from collectNameIds (161, 163, 183). Export collectValuationTypeIds(raws) = sorted(raws.flatMap(valuationTypeIdsOf)).
4. name-book.ts: delete the resolveValuationBook import, the valuation slot of Promise.all, ResolvedNameBook and the last three return fields. Type the return as Promise<NameBook>.
5. board-view.ts: recordNetWorthSnapshot calls resolveValuationBook(collectValuationTypeIds(raws)) and then netWorthSnapshot(raws, valuation, utcDay(now)), with no remapping object. getBoardForUserOnView calls resolveNameBook(collectNameIds(raws)).
6. demo-board.ts: split DEMO_NAMES. Add const DEMO_VALUATION: Valuation = { prices: DEMO_PRICES, categories: DEMO_CATEGORIES }, use it at 860, and remove prices and typeCategories from DEMO_NAMES.
7. board-assemble.test.ts: split NAMES into NAMES and VALUATION (77-98) and pass VALUATION to netWorthSnapshot (369, 455). Move the valuationTypeIds assertions (143-144, 438, 448) into collectValuationTypeIds tests, keeping the denied-implant exclusion case.

**Tests.** Existing guards: board-assemble.test.ts (net-worth snapshot and section-state suites, collectNameIds), price-book.test.ts (unseeded), board-view.db.test.ts (getBoardForUserOnView and recordNetWorthSnapshot against Neon; run it where reachable), demo-board.test.ts:170 (demo net-worth totals), net-worth-link.test.ts and net-worth-nightly.test.ts (snapshot callers). Add: collectValuationTypeIds tests (sorted, de-duplicated, excludes denied active implants, includes jump-clone implants and open orders).

**Notes.** No runtime behavior changes. The view's valuation fetch already returned empty maps without touching the DB, and the snapshot path keeps the same inputs (the same sorted, de-duplicated valuationTypeIds) and still seeds valuation.unseeded. Keep valuationTypeIdsOf's denied-implant rule exactly as it is (implantIdsOf drops active implants when the implants envelope is denied); the board-assemble test at 136-145 guards it.

<sub>Reported by: area:composition.</sub>

<a id="p174"></a>

## P174: Give src/scripts one bootstrap: a load-env side-effect import, createScriptClient, client-optional runScript and publicTableExists

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** low · **Size:** about -55/+45 across 12 scripts plus script-runtime; +60 test lines
- **Depends on:** —
- **Existing primitive:** `src/scripts/script-runtime.ts:runScript`

**Problem.** src/scripts has no shared entry bootstrap:
- Twelve CLI entry points repeat `config({ path: readEnv('DOTENV_PATH') ?? '.env.local' })`, in varying positions between imports.
- Eight sites build their own postgres-js client with an individually stated max and connect_timeout, so the vendor-resilience census pins every script file.
- runScript requires a postgres client, so warm-neon and project-map-access hand-write then(exit 0)/catch(exit 1).
- ingest-sde-if-empty and backfill-users-if-empty each embed the same information_schema table-exists query.

**Verifier revision.** The duplication is real, and the shared code belongs in the scripts zone. Twelve entry points repeat the same dotenv line. Seven scripts plus script-runtime each hand-build postgres(url, { max, connect_timeout }), and vendor-resilience.test.ts:43-54 has to pin every one of those files and check each for connect_timeout. The two *-if-empty scripts duplicate the information_schema probe. warm-neon and project-map-access hand-roll the exit handling that runScript already provides. Corrections:
(1) 'config after the data imports' in check-wh-statics, check-universe-assets and ci-sde-seed is not a demonstrated bug. Nothing in those import graphs reads env at module load: db/index.ts resolves env lazily (getClient and getDb, lines 33-58), and resolveLockConnectionUrl() is called at script module scope after config(). It is an ordering hazard, and every script that calls config() between imports shares it under ESM import hoisting, which a first side-effect import fixes.
(2) A URL-kind enum ('lock' | 'database' | 'migration') is the wrong API. ci-sde-seed also needs the raw DATABASE_URL for parseSdeSeedPgTarget (ci-sde-seed.ts:150), and migrate derives its URL via resolveMigrationUrl (migrate.ts:12-15). Take the URL as a string.
(3) Leave map-replay optional. It has a usage() exit path, a --loop mode, and message-only error printing.

**Sites (14).**

- [`src/scripts/script-runtime.ts:5-38`](../../src/scripts/script-runtime.ts#L5-L38) — existing requireSoftFailLockClient (postgres(resolveLockConnectionUrl(), {max: 2, connect_timeout})) and runScript, which requires a client
- [`src/scripts/ingest-sde.ts:1-14`](../../src/scripts/ingest-sde.ts#L1-L14) — dotenv at line 3; postgres(DATABASE_URL, {max: 1}) at line 14
- [`src/scripts/migrate.ts:1-17`](../../src/scripts/migrate.ts#L1-L17) — dotenv at line 7; postgres(resolveMigrationUrl(...), {max: 1}) at line 17
- [`src/scripts/refresh-prices.ts:1-16`](../../src/scripts/refresh-prices.ts#L1-L16) — dotenv at line 3; postgres(resolveLockConnectionUrl(), {max: 5}) at line 16
- [`src/scripts/refresh-sde.ts:1-24`](../../src/scripts/refresh-sde.ts#L1-L24) — dotenv at line 3; postgres(resolveLockConnectionUrl(), {max: 2}) at line 24
- [`src/scripts/check-wh-statics.ts:2-24`](../../src/scripts/check-wh-statics.ts#L2-L24) — dotenv at line 13 after all imports; postgres(lock URL, {max: 1}) at 21-24
- [`src/scripts/check-universe-assets.ts:3-44`](../../src/scripts/check-universe-assets.ts#L3-L44) — dotenv at line 24 after all imports; postgres(lock URL, {max: 1}) at 41-44
- [`src/scripts/ci-sde-seed.ts:6-38`](../../src/scripts/ci-sde-seed.ts#L6-L38) — dotenv at line 31 after all imports; postgres(DATABASE_URL, {max: 1}) at 33-38; raw URL reused at line 150
- [`src/scripts/backfill-users-if-empty.ts:1-12, 62-72`](../../src/scripts/backfill-users-if-empty.ts#L1-L12) — dotenv at line 3; requireSoftFailLockClient; information_schema probe for 'user'
- [`src/scripts/ingest-sde-if-empty.ts:1-23, 57-67`](../../src/scripts/ingest-sde-if-empty.ts#L1-L23) — dotenv at line 3; requireSoftFailLockClient; information_schema probe for 'eve_data_meta' via drizzle db.execute
- [`src/scripts/warm-neon.ts:1-24`](../../src/scripts/warm-neon.ts#L1-L24) — dotenv at line 5; uses the @/db singleton; hand-written exit handling at 17-24
- [`src/scripts/project-map-access.ts:1-33`](../../src/scripts/project-map-access.ts#L1-L33) — dotenv at line 8 after the composition import; hand-written exit handling at 24-33
- [`src/scripts/map-replay.ts:1-24, 257-262`](../../src/scripts/map-replay.ts#L1-L24) — dotenv at line 24 after imports; usage() exit plus run().catch(exit 1) with no exit(0)
- [`src/esi-datasets/vendor-resilience.test.ts:43-54, 163-174`](../../src/esi-datasets/vendor-resilience.test.ts#L43-L54) — PRODUCTION_POSTGRES_SITES pins all 8 script construction sites; each must contain connect_timeout

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/scripts/vercel-convex-deploy.ts:48-58`](../../src/scripts/vercel-convex-deploy.ts#L48-L58) — No dotenv or DB. It propagates a child process exit code, which runScript's 0/1 semantics do not fit.
- [`scripts/apply-neon-config.ts:9`](../../scripts/apply-neon-config.ts#L9) — Top-level scripts/ is outside every boundary zone and reads process.env directly. Leave it.
- [`scripts/validate-resolver-output.ts:39`](../../scripts/validate-resolver-output.ts#L39) — Same as apply-neon-config: outside the zones.
- [`src/db/index.ts:24-26, 47-58`](../../src/db/index.ts#L24-L26) — Production app client with query timing. It must stay separate from the CLI factory.

</details>

**Home.** `src/scripts/load-env.ts (new side-effect module) and src/scripts/script-runtime.ts (extended)`

**Boundary check.** Every consumer is in the scripts zone (patterns src/scripts/**), so imports inside the zone are legal. script-runtime.ts already imports @/db, which {from: scripts} allows ('db'), and @/lib/env ('lib'). It imports the postgres package, which the server-only-boundary VENDOR_OWNER_RULES (owners src/db/, src/scripts/) and the eslint postgres restriction ('and the src/scripts CLI band') permit. load-env.ts imports dotenv and @/lib/env ('lib'). The eslint process.env ban requires readEnv rather than process.env, unlike e2e/load-env.ts. Nothing outside scripts imports these modules.

**API sketch.**

```ts
// src/scripts/load-env.ts — side effect only, must be each entry's first import
import { config } from 'dotenv';
import { readEnv } from '@/lib/env';
config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

// src/scripts/script-runtime.ts
export function createScriptClient(url: string, options: { max: number }): Sql; // postgres(url, { max, connect_timeout: PG_CONNECT_TIMEOUT_SECONDS })
export function requireSoftFailLockClient(missingDatabaseMessage: string, lockFailurePrefix: string): Sql; // now createScriptClient(resolveLockConnectionUrl(), { max: 2 })
export function runScript(main: () => Promise<void>, options?: { client?: Sql; softFail?: boolean }): void;
export async function publicTableExists(client: Sql, table: string): Promise<boolean>; // throws if the EXISTS query returns no row
```

**Migration steps.**

1. Add src/scripts/load-env.ts as in the API sketch.
2. In script-runtime.ts, add createScriptClient. Re-implement requireSoftFailLockClient on top of it, keeping max: 2 and the soft-fail exit(0) paths. Make runScript's client optional and call `options.client?.end()`. Add publicTableExists with the query from backfill-users-if-empty.ts:62-67, parameterised on the table name.
3. Replace the two-line dotenv bootstrap with `import './load-env';` as the first import in all 12 entries: backfill-users-if-empty, check-universe-assets, check-wh-statics, ci-sde-seed, ingest-sde-if-empty, ingest-sde, map-replay, migrate, project-map-access, refresh-prices, refresh-sde and warm-neon. Remove `import { config } from 'dotenv'` and any readEnv import that becomes unused.
4. Replace postgres(...) with createScriptClient(url, { max }) in check-universe-assets (lock URL, max 1), check-wh-statics (lock, 1), ci-sde-seed (keep the databaseUrl const, max 1), ingest-sde (DATABASE_URL, 1), migrate (resolveMigrationUrl, 1), refresh-prices (lock, 5) and refresh-sde (lock, 2). Drop each `import postgres from 'postgres'` and the PG_CONNECT_TIMEOUT_SECONDS import.
5. Use publicTableExists(client, 'eve_data_meta') in ingest-sde-if-empty and publicTableExists(client, 'user') in backfill-users-if-empty. Keep each script's own skip message.
6. Move warm-neon and project-map-access onto runScript(main) with no client. project-map-access keeps its argv validation and exit(1) before calling runScript, and prints its JSON result inside main. map-replay is optional; if you migrate it, keep usage() and accept full-error printing.
7. Update vendor-resilience.test.ts PRODUCTION_POSTGRES_SITES to ['src/db/index.ts', 'src/scripts/script-runtime.ts'].
8. Smoke-run the build:vercel prebuild scripts one at a time against a local DB through tsx: migrate, backfill-users-if-empty, ingest-sde-if-empty and warm-neon. Also run them with DATABASE_URL unset to confirm the soft-fail exit(0). Then run check:wh-statics and db:refresh-prices.

**Tests.** Add src/scripts/script-runtime.test.ts. It should cover:
- createScriptClient forwards max and connect_timeout (mock 'postgres').
- requireSoftFailLockClient exits 0 with the message when no DATABASE_URL is set.
- runScript exits 0 on success, 1 on failure, and 0 on failure with softFail.
- runScript calls client.end() only when a client is given (mock process.exit).
- publicTableExists returns row.exists and throws on an empty result.
Update vendor-resilience.test.ts PRODUCTION_POSTGRES_SITES. Its 'states an explicit establishment bound' check then covers the factory once. Existing guards: migrate-url.test.ts, sde-bootstrap.test.ts and warm-neon-query.test.ts are unaffected. scripts/vendor-rail.test.mjs allowPostgresMigrate lints a probe, not migrate.ts's contents, so it stays valid.

**Notes.** Preserve each script's URL choice. The two check-* scripts deliberately use resolveLockConnectionUrl (the unpooled direct URL) even though they take no lock, and ingest-sde and ci-sde-seed use DATABASE_URL. Preserve each pool size (1, 2 or 5). refreshStalePrices(client) in refresh-prices needs more than one connection. ingest-sde-if-empty currently runs the probe through drizzle `db.execute` and the `{ exists }` row shape. Switching to the postgres-js tagged template returns the same boolean. project-map-access and map-replay print only error.message, while runScript prints the full error. That is acceptable for dev tools, but call it out in the PR. The side-effect import also fixes the latent ordering hazard: under ESM hoisting, a config() call placed between imports runs after every static import, and a first side-effect import does not.

<sub>Reported by: area:lib-infra, concern:esi-sync.</sub>

<a id="p316"></a>

## P316: Move admin period math into app/(site)/admin, absorb lastNDaysRange, and align parseRange with its client twin

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** low · **Size:** about -20 / +15, plus 26 mechanical import rewrites
- **Depends on:** [P107](wave-04-formatting-dates-and-names-have-one-home.md#p107)
- **Existing primitive:** `src/data/telemetry/queries.ts:lastNDaysRange`

**Problem.** composition/admin-period.ts is admin-only presentation math, imported by 25 app/(site)/admin files including a client component, and filed in the composition zone. Its test already sits in app/(site)/admin. rangeFor repeats lastNDaysRange, a pure function stranded in the DB-backed data/telemetry/queries.ts. searchPeriods repeats the 7/30/90 day mapping, and the admin folder defines the day-in-ms constant three times as named constants and twice more inline. parseRange(['7d','90d']) returns the default '30d', but RangeSelector reads useSearchParams().get('range') and gets '7d'. With a repeated ?range the page renders 30-day data while the selector highlights 7d, and the rail links carry 7d.

**Verifier revision.** The move is justified: all 25 production importers of composition/admin-period are under app/(site)/admin. Its test already lives at app/(site)/admin/period.test.ts while importing '@/composition/admin-period', and the module is pure presentation math imported by a 'use client' component (RangeSelector), so it does not belong in the server-composition zone. The 7/30/90 mapping really is duplicated in search-period.ts, and rangeFor's non-'all' branch is byte-for-byte lastNDaysRange. One design step is wrong: 'have rangeFor call lastNDaysRange'. lastNDaysRange lives in data/telemetry/queries.ts, which imports '@/db' and drizzle, and the period module is imported by RangeSelector.tsx ('use client'). The pure helper must move into the period module instead. The broad search-param helper also does not survive. Most sites only check `typeof raw === 'string'`, and the two 'take first' sites are deliberate: atlasMapHref matches the client's URLSearchParams.get. The one harmful drift is parseRange: the server rejects arrays while the client twin takes the first value.

**Sites (13).**

- [`src/composition/admin-period.ts:1-45`](../../src/composition/admin-period.ts#L1-L45) — RANGES, ALL_TIME_FROM, parseRange (rejects arrays), rangeFor (inline 7/30/90 mapping and 24*60*60*1000), previousRange, computeDelta, trendSeries
- [`src/app/(site)/admin/period.test.ts:1-45`](../../src/app/%28site%29/admin/period.test.ts#L1-L45) — Already in the target folder; imports @/composition/admin-period. Line 15 pins parseRange(['7d']) === '30d'.
- [`src/data/telemetry/queries.ts:406-410`](../../src/data/telemetry/queries.ts#L406-L410) — lastNDaysRange: pure, same body as rangeFor's non-'all' branch. The module imports @/db and drizzle (lines 1-20).
- [`src/app/(site)/admin/users/page.tsx:14, 243`](../../src/app/%28site%29/admin/users/page.tsx#L14) — Only production consumer of lastNDaysRange (90-day audit window)
- [`src/app/(site)/admin/search/search-period.ts:1-22`](../../src/app/%28site%29/admin/search/search-period.ts#L1-L22) — Duplicate 7/30/90 mapping and its own DAY_MS. Inclusive whole-day semantics differ from rangeFor and must be kept.
- [`src/app/(site)/admin/RangeSelector.tsx:1-24`](../../src/app/%28site%29/admin/RangeSelector.tsx#L1-L24) — 'use client'; imports parseRange and RANGES; reads useSearchParams().get('range'), which takes the first value
- [`src/app/(site)/admin/admin-nav.tsx:133`](../../src/app/%28site%29/admin/admin-nav.tsx#L133) — Rail reads get('range') (first value) and carries it via adminSectionHref
- [`src/composition/coverage.test.ts:3, 15`](../../src/composition/coverage.test.ts#L3) — Pins RANGES on the test graph; must move or be dropped with the module
- [`src/app/(site)/admin/activity-view.ts:6, 101-103`](../../src/app/%28site%29/admin/activity-view.ts#L6) — Own MS_PER_DAY constant
- [`src/app/(site)/admin/aggregate.ts:1-9`](../../src/app/%28site%29/admin/aggregate.ts#L1-L9) — Own MS_PER_DAY constant
- [`src/app/(site)/admin/AudienceCard.tsx:41`](../../src/app/%28site%29/admin/AudienceCard.tsx#L41) — Inline 86_400_000 for the inclusive GSC day count
- [`src/features/maps/map-navigation.ts:17-23`](../../src/features/maps/map-navigation.ts#L17-L23) — atlasMapHref takes the first element, consistent with client get('map')
- [`src/composition/board/demo-board.ts:83-88`](../../src/composition/board/demo-board.ts#L83-L88) — demoVariant takes the first element

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/wormhole-sites/components/SitesTableFromUrl.tsx:10-12`](../../src/features/wormhole-sites/components/SitesTableFromUrl.tsx#L10-L12) — scalarParam rejects arrays; harmless for sort/dir and no client twin disagrees. A shared one-liner adds indirection without fixing anything.
- [`src/lib/error-copy.ts:1-8`](../../src/lib/error-copy.ts#L1-L8) — resolveErrorMessage: rejecting arrays returns null, which is the correct 'no error' outcome. Not drift.
- [`src/app/(site)/admin/statics/page.tsx:26-28`](../../src/app/%28site%29/admin/statics/page.tsx#L26-L28) — Same typeof-string guard for an outcome flash. Not drift.
- [`src/app/(site)/admin/users/page.tsx:38-42`](../../src/app/%28site%29/admin/users/page.tsx#L38-L42) — sanitiseQuery also sanitises and caps length; a different concern
- [`src/app/(site)/page.tsx:61-65`](../../src/app/%28site%29/page.tsx#L61-L65) — auth_error guard; not drift
- [`src/app/(site)/admin/search/search-period.ts:11-21`](../../src/app/%28site%29/admin/search/search-period.ts#L11-L21) — Only the day mapping is shared. Inclusive, non-overlapping GSC windows are not the same as rangeFor's millisecond windows; do not merge the functions.

</details>

**Home.** `src/app/(site)/admin/period.ts (app zone). Optional: src/lib/search-params.ts for firstSearchParam.`

**Boundary check.** period.ts is in app. Every production importer is in app/(site)/admin (intra-zone), including the 'use client' RangeSelector, and the test sits beside it. period.ts imports only the type DateRange from @/data/telemetry/types (the app rule allows data). Moving lastNDaysRange out of data/telemetry/queries.ts removes a pure helper from a DB module; its only consumer, admin/users/page.tsx, is in app. Optional src/lib/search-params.ts: consumers would be app (period.ts), composition (demo-board.ts) and features (map-navigation.ts), and the app, composition and features rules all allow lib. lib imports nothing new.

**API sketch.**

```ts
// src/app/(site)/admin/period.ts
export const RANGES = ['7d', '30d', '90d', 'all'] as const;
export type RangeKey = (typeof RANGES)[number];
export const RANGE_DAYS: Readonly<Record<Exclude<RangeKey, 'all'>, number>> = { '7d': 7, '30d': 30, '90d': 90 };
export const DAY_MS = 86_400_000;
export const ALL_TIME_FROM: Date;
export function parseRange(raw: string | string[] | undefined): RangeKey; // takes raw[0] like URLSearchParams.get
export function lastNDaysRange(days: number, now?: Date): DateRange;
export function rangeFor(key: RangeKey, now?: Date): DateRange; // key === 'all' ? { from: ALL_TIME_FROM, to: now } : lastNDaysRange(RANGE_DAYS[key], now)
// previousRange, Delta, computeDelta, trendSeries unchanged
// optional src/lib/search-params.ts
export function firstSearchParam(raw: string | string[] | undefined): string | undefined; // Array.isArray(raw) ? raw[0] : raw
```

**Migration steps.**

1. git mv src/composition/admin-period.ts to src/app/(site)/admin/period.ts. Rewrite the 25 '@/composition/admin-period' imports under app/(site)/admin to './period' or '../period'.
2. Move lastNDaysRange from data/telemetry/queries.ts:406-410 into period.ts. Update admin/users/page.tsx to import it from '../period'. Move its describe block from data/telemetry/queries.test.ts into period.test.ts.
3. In period.ts, add RANGE_DAYS and DAY_MS, and rewrite rangeFor as 'all' ? {ALL_TIME_FROM, now} : lastNDaysRange(RANGE_DAYS[key], now). Do not import anything from data/telemetry/queries; RangeSelector is a client component.
4. search-period.ts: import RANGE_DAYS and DAY_MS from '../period' and delete the local DAY_MS and ternary. Keep its inclusive (days - 1) window math.
5. Replace MS_PER_DAY in activity-view.ts and aggregate.ts, and the inline 86_400_000 in AudienceCard.tsx:41, with DAY_MS. signals.ts:282 is optional.
6. parseRange: take the first array element (Array.isArray(raw) ? raw[0] : raw) so the server agrees with RangeSelector and the rail, which use URLSearchParams.get. Update period.test.ts:15 to expect parseRange(['7d']) === '7d', and add ['bogus', '7d'] → '30d'.
7. composition/coverage.test.ts: remove the RANGES import and pin. In period.test.ts, add a case that parseRange accepts every RANGES entry so the export stays on the test graph.
8. Optional: add src/lib/search-params.ts firstSearchParam and use it in parseRange, demoVariant and atlasMapHref. Leave the typeof-string guards (sites list, error-copy, statics, auth_error, users query) unchanged.

**Tests.** period.test.ts (moved imports): add the RANGE_DAYS-based rangeFor equivalence (rangeFor('7d', NOW) deep-equals lastNDaysRange(7, NOW)), the lastNDaysRange cases moved from queries.test.ts, and the changed array policy. search-period.test.ts must pass unchanged; it guards the inclusive window semantics. admin-sections.test.ts rangeHref and adminSectionHref cases guard the default-range behavior. If firstSearchParam is added, give it a lib test, and keep the existing demo-board and map-navigation tests passing.

**Notes.** Correct policy: take the first element, matching URLSearchParams.get on the client (RangeSelector.tsx:23, admin-nav.tsx:133). The server parseRange is the drifted copy. Keep searchPeriods' inclusive whole-date windows; only the day mapping is shared. Keep rangeFor's default now = new Date() behavior. Related lead in the same folder: four local ISO-day slicers bypass lib/format/time formatIsoDay (activity-view.ts:10, health/health-view.ts:74, users/[userId]/page.tsx:36, aggregate.ts:8), while SearchCards and IndexCoverageCard already use formatIsoDay.

<sub>Reported by: area:composition.</sub>

<a id="p282"></a>

## P282: Share the range-key day count and keep admin reads from waiting on the GSC report date

- **Status:** [ ] not started
- **Category:** efficiency · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about +20 / -8 lines
- **Depends on:** [P316](#p316)
- **Existing primitive:** `src/composition/admin-period.ts:rangeFor`

**Problem.** The 7/30/90 day mapping is written twice, and the inclusive GSC day count is derived ad hoc in AudienceCard. On /admin, the Audience slot runs seven telemetry reads only after the GSC report-date round trip. On /admin/search, the Index coverage and Sitemaps slots also wait behind that read, and go blank with it if it fails, although neither depends on the report date.

**Verifier revision.** Each cited fact checks out. search-period.ts:13 is a copy of rangeFor's day mapping (admin-period.ts:15). AudienceCard.tsx:28 awaits getLatestReportDate before a Promise.all where 7 of 9 reads (search-vs-direct, returning-vs-new and daily counts for current and previous, plus deploy markers) do not depend on it. AudienceCard.tsx:41 recomputes the inclusive GSC day count inline. search/page.tsx:15-16 makes IndexCoverageCard (which uses rangeFor(rangeKey)) and SitemapsCard wait on latestDay, and hides them when that read fails, although neither uses it. The design changes in two ways. First, 'start the non-GSC reads, then await the report date' must become a single Promise.all that includes the GSC branch as a promise. A bare await between started promises leaves them unobserved when getLatestReportDate rejects, which produces unhandled rejections. Second, the search page fix should move latestDay into a nested Suspense child (AGENTS: smallest Suspense hole). That also isolates failures, which the proposal did not mention. Expected gain is one database round trip on two slots, so the payoff is low but real.

**Sites (7).**

- [`src/app/(site)/admin/search/search-period.ts:7-22`](../../src/app/%28site%29/admin/search/search-period.ts#L7-L22) — Line 13 copies rangeFor's mapping. The `all` branch (12) returns no day count.
- [`src/composition/admin-period.ts:13-17`](../../src/composition/admin-period.ts#L13-L17) — rangeFor holds the canonical mapping (15) and uses an inline 24*60*60*1000.
- [`src/app/(site)/admin/AudienceCard.tsx:22-42`](../../src/app/%28site%29/admin/AudienceCard.tsx#L22-L42) — Line 28 is a sequential await before the Promise.all (30-40). Line 41 derives the inclusive day count inline from the span.
- [`src/app/(site)/admin/metric-view.ts:17-28,59-65`](../../src/app/%28site%29/admin/metric-view.ts#L17-L28) — gscRangeDays is only read when gscTotals is non-null, so the GSC branch only needs days when the report date exists.
- [`src/app/(site)/admin/search/page.tsx:12-34`](../../src/app/%28site%29/admin/search/page.tsx#L12-L34) — latestDay (15-17) blocks all four slots. IndexCoverageCard (27) and SitemapsCard (30) never use it, and a failure at line 16 replaces them too.
- [`src/app/(site)/admin/AudienceCard.test.ts:52-110`](../../src/app/%28site%29/admin/AudienceCard.test.ts#L52-L110) — Pins the GSC windows, skip rules (no getSearchTotals when not configured or latestDay is null), and the section-failure path.
- [`src/app/(site)/admin/search/search-period.test.ts:4-18`](../../src/app/%28site%29/admin/search/search-period.test.ts#L4-L18) — Pins the inclusive windows and the all-time behavior.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/activity-view.ts:101-103`](../../src/app/%28site%29/admin/activity-view.ts#L101-L103) — rangeDayCount is an exclusive, rounded span with a minimum of 1 for telemetry ranges. Different semantics from GSC's inclusive day count, so do not merge.
- [`src/app/(site)/admin/signals.ts:282`](../../src/app/%28site%29/admin/signals.ts#L282) — Inline 86_400_000 for a staleness age, not a range-key mapping. There are about 27 day-ms literals across src; that is a separate lead, out of scope here.

</details>

**Home.** `src/composition/admin-period.ts (RANGE_DAYS); searchPeriods stays in src/app/(site)/admin/search/search-period.ts`

**Boundary check.** RANGE_DAYS lives in the composition zone. Its consumers, search-period.ts, AudienceCard.tsx and search/page.tsx, are in the app zone, and the rule app allow [..., composition, ...] permits them. search-period.ts already imports ALL_TIME_FROM and RangeKey from there. admin-period.ts gains no new imports.

**API sketch.**

```ts
// admin-period.ts
export const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const satisfies Record<Exclude<RangeKey, 'all'>, number>;
// search-period.ts
export function searchPeriods(key: RangeKey, latestDay: string): { range: DateRange; previous: DateRange | null; days: number };
// AudienceCard.tsx (private)
async function loadSearchWindow(gsc: boolean, rangeKey: RangeKey): Promise<{ totals: GscTotals; prevTotals: GscTotals | null; days: number } | null>;
// search/page.tsx (private)
async function SearchPeriodCards({ rangeKey }: { rangeKey: RangeKey }): Promise<ReactNode>;
```

**Migration steps.**

1. admin-period.ts: export RANGE_DAYS and make rangeFor use `RANGE_DAYS[key]`.
2. search-period.ts: replace line 13 with `RANGE_DAYS[key]`. Add `days` to the result: RANGE_DAYS[key] for 7d/30d/90d, and `Math.round((to.getTime() - ALL_TIME_FROM.getTime()) / DAY_MS) + 1` for `all`, which equals today's AudienceCard formula.
3. AudienceCard.tsx: add a private loadSearchWindow(gsc, rangeKey). It returns null when !gsc. Otherwise it awaits getLatestReportDate, returns null when that is null, then calls searchPeriods and runs Promise.all of getSearchTotals(periods.range) and, only when periods.previous is set, getSearchTotals(periods.previous). It returns { totals, prevTotals, days: periods.days }.
4. AudienceCard.tsx: inside loadSection, run ONE Promise.all over the seven non-GSC reads plus loadSearchWindow(...). Never `await` between starting promises. Map the result to buildMetricRows with gscTotals = search?.totals ?? null, prevGscTotals = search?.prevTotals ?? null, gscRangeDays = search?.days. Delete the inline 86_400_000 computation.
5. search/page.tsx: move the getLatestReportDate await, searchPeriods and the Performance and Top queries AdminSlots into a new async SearchPeriodCards({ rangeKey }). On SECTION_LOAD_FAILED it returns <SectionUnavailable label="Search performance" />. Keep the existing `latestDay ?? today` fallback.
6. search/page.tsx: SearchContent keeps the isGscConfigured() guard. It renders <Suspense fallback={two CardFallbacks: Performance rows=4, Top queries rows=8}><SearchPeriodCards rangeKey={rangeKey} /></Suspense>, then the Index coverage and Sitemaps AdminSlots directly, keeping reveal order 1-4.

**Tests.** search-period.test.ts: assert `days` equals 7/30/90 and equals the inclusive count for 'all' against ALL_TIME_FROM. period.test.ts: assert rangeFor(key, NOW) spans RANGE_DAYS[key] days. AudienceCard.test.ts: make getLatestReportDate a deferred promise and assert getSearchVsDirect, getReturningVsNew and getDailyCounts were called before resolving it. The existing tests at 52-110 must still pass unchanged: same windows, same skip rules, same failure output. Add src/app/(site)/admin/search/page.test.ts (prerender with @/data/gsc/queries mocked): when getLatestReportDate rejects, the Index coverage and Sitemaps content still renders and only the period cards show 'Unable to load'.

**Notes.** Preserve these behaviors. getSearchTotals must not be called when GSC is unconfigured or latestDay is null (AudienceCard.test.ts:82-103). gscRangeDays only matters when totals exist (metric-view.ts:59-65). The search page keeps `latestDay ?? today` for its trend cards while AudienceCard skips GSC entirely on null; that divergence is intentional, so keep both. A getLatestReportDate failure still fails the whole Audience section (same as today), but on the search page it now fails only the two period cards, which is an improvement. Use a single Promise.all to avoid unhandled rejections. If P281 lands first, the period cards' getSearchTotals calls become getSearchTotalsShared; the two changes do not conflict.

<sub>Reported by: area:app-site.</sub>

<a id="p281"></a>

## P281: Cache degradation and search-total reads per request with one range-keyed helper, and drop dead ESI cost reads

- **Status:** [ ] not started
- **Category:** efficiency · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -15 / +14 lines; removes 2 DB queries per /admin/esi render and 1 per /admin/search render
- **Depends on:** —
- **Existing primitive:** `src/app/(site)/admin/esi-source-shared.ts:getFallbackRateShared`

**Problem.** esi-source-shared.ts hand-writes the range-keyed cache() pattern twice. Two other range reads that several cards on one page need, getDegradationByCaller and getSearchTotals, skip it and hit the database again for each card. loadCost also fetches degradation and fallback data that deriveCostLensView ignores or returns unused.

**Verifier revision.** The duplicate reads are real. On /admin/esi, getDegradationByCaller(range), an uncached GROUP BY over usage_logs, runs three times per render (EsiCards.tsx:72, 92, 143). On /admin/search, getSearchTotals(range) runs twice (SearchCards.tsx:74, 114) with the same range object (search/page.tsx:17-24). The third degradation read in loadCost is dead: deriveCostLensView accepts degradationByCaller and never reads it (ops-view.ts:69-125). loadCost's getFallbackRateShared only feeds the view's `fallback` output, which CostCards never reads. Two parts of the proposal change. First, merging the four *-shared.ts files is dropped. The three zero-argument files are one-line cache() wrappers that already dedupe. Merging them is cosmetic and widens the vi.mock seams in admin-console.test.ts:22-30. Second, the rationale for ISO keys is wrong as stated: each page builds one range and passes the same object to every card, so identity-keyed cache() would also dedupe. ISO keying is still the more robust key and matches the existing helper, so keep it, generalized once.

**Sites (12).**

- [`src/app/(site)/admin/esi-source-shared.ts:1-22`](../../src/app/%28site%29/admin/esi-source-shared.ts#L1-L22) — Two hand-written ISO-keyed cache() readers. This is the existing primitive to generalize.
- [`src/app/(site)/admin/esi/EsiCards.tsx:66-75`](../../src/app/%28site%29/admin/esi/EsiCards.tsx#L66-L75) — PressureCard: getDegradationByCaller(range), uncached.
- [`src/app/(site)/admin/esi/EsiCards.tsx:90-93`](../../src/app/%28site%29/admin/esi/EsiCards.tsx#L90-L93) — PriceSourceCard: getDegradationByCaller(range) again.
- [`src/app/(site)/admin/esi/EsiCards.tsx:133-155`](../../src/app/%28site%29/admin/esi/EsiCards.tsx#L133-L155) — loadCost: getDegradationByCaller (143) and getFallbackRateShared (141) feed deriveCostLensView inputs that do not reach the rendered output.
- [`src/app/(site)/admin/ops-view.ts:69-125`](../../src/app/%28site%29/admin/ops-view.ts#L69-L125) — The degradationByCaller input (76) is never read. fallback (74) only feeds the `fallback` output (121-124), which CostCards (EsiCards.tsx:157-176) never uses.
- [`src/app/(site)/admin/esi/page.tsx:6-26`](../../src/app/%28site%29/admin/esi/page.tsx#L6-L26) — One range object goes to PressureCard, PriceSourceCard and CostCards in the same request.
- [`src/data/telemetry/queries.ts:263-278`](../../src/data/telemetry/queries.ts#L263-L278) — getDegradationByCaller: a grouped SQL query with no cache.
- [`src/app/(site)/admin/search/SearchCards.tsx:69-77,112-115`](../../src/app/%28site%29/admin/search/SearchCards.tsx#L69-L77) — PerformanceCard and TermCards each call getSearchTotals(range).
- [`src/app/(site)/admin/search/page.tsx:17-25`](../../src/app/%28site%29/admin/search/page.tsx#L17-L25) — The same `range` object goes to both cards.
- [`src/data/gsc/queries.ts:98-104`](../../src/data/gsc/queries.ts#L98-L104) — getSearchTotals: an uncached aggregate query.
- [`src/app/(site)/admin/load-signals.ts:17,26-27,51-52`](../../src/app/%28site%29/admin/load-signals.ts#L17) — The other consumer of the range-keyed readers. It builds its own range inside a rangeKey-cached loader, so its import path changes.
- [`src/app/(site)/page-coverage.test.ts:75,164-165`](../../src/app/%28site%29/page-coverage.test.ts#L75) — Pins the esi-source-shared exports by path. It must follow the rename and pin the new exports.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/last-synced.ts:1-4`](../../src/app/%28site%29/admin/last-synced.ts#L1-L4) — Zero-argument cache(getLastSyncedAt) that already dedupes. Merging it gains nothing.
- [`src/app/(site)/admin/queue-stats-shared.ts:1-4`](../../src/app/%28site%29/admin/queue-stats-shared.ts#L1-L4) — Zero-argument cache() wrapper that already dedupes. admin-console.test.ts:22-26 mocks it by path, so merging would widen that mock.
- [`src/app/(site)/admin/statics-review-shared.ts:1-4`](../../src/app/%28site%29/admin/statics-review-shared.ts#L1-L4) — Zero-argument cache() wrapper that already dedupes. admin-console.test.ts:28-30 mocks it by path.
- [`src/app/(site)/admin/traffic/TrafficCards.tsx:58-65`](../../src/app/%28site%29/admin/traffic/TrafficCards.tsx#L58-L65) — getDailyCounts runs twice, but with two different ranges (current and previous). Not a duplicate.
- [`src/app/(site)/admin/AudienceCard.tsx:30-36`](../../src/app/%28site%29/admin/AudienceCard.tsx#L30-L36) — getSearchTotals is the only caller on /admin, with GSC-day ranges. Nothing to dedupe.

</details>

**Home.** `src/app/(site)/admin/range-reads.ts (git mv of esi-source-shared.ts, since the module will no longer be ESI-only)`

**Boundary check.** The home is in the app zone (src/app/**). Every consumer (EsiCards.tsx, SearchCards.tsx, load-signals.ts, all under src/app/(site)/admin) is also in app, and same-zone imports are always allowed. The module imports react (external), @/data/telemetry/queries, @/data/gsc/queries and @/data/telemetry/types (data zone). The rule app allow [..., data, ...] permits these.

**API sketch.**

```ts
// src/app/(site)/admin/range-reads.ts
import { cache } from 'react';
type RangeRead<T> = (range: DateRange) => Promise<T>;
function cacheByRange<T>(read: RangeRead<T>): RangeRead<T> {
  const cached = cache((from: string, to: string) => read({ from: new Date(from), to: new Date(to) }));
  return (range) => cached(range.from.toISOString(), range.to.toISOString());
}
export const getFallbackRateShared = cacheByRange(getFallbackRate);
export const getBudgetExhaustionCountShared = cacheByRange(getBudgetExhaustionCount);
export const getDegradationByCallerShared = cacheByRange(getDegradationByCaller);
export const getSearchTotalsShared = cacheByRange(getSearchTotals); // GscRange is structurally DateRange

// ops-view.ts
export function deriveCostLensView(input: { prices; history; writeBehind; endpoints; budgetExhaustions }): { metrics; endpoints }
```

**Migration steps.**

1. git mv src/app/(site)/admin/esi-source-shared.ts src/app/(site)/admin/range-reads.ts. Add the private cacheByRange helper and re-express getFallbackRateShared and getBudgetExhaustionCountShared through it, keeping their names and signatures.
2. Add getDegradationByCallerShared and getSearchTotalsShared to range-reads.ts.
3. EsiCards.tsx: PressureCard (line 72) and PriceSourceCard (line 92) call getDegradationByCallerShared(range). Update the import from '../esi-source-shared' to '../range-reads' and drop getDegradationByCaller from the @/data/telemetry/queries import.
4. EsiCards.tsx loadCost: remove the getFallbackRateShared and getDegradationByCaller entries from the Promise.all, leaving five reads.
5. ops-view.ts deriveCostLensView: delete the `fallback` and `degradationByCaller` input fields and the `fallback` output block (lines 121-124). Drop FallbackRateData and DegradationCallerCount from its imports if nothing else uses them.
6. SearchCards.tsx: PerformanceCard (lines 74-75, current and previous) and TermCards (line 114) call getSearchTotalsShared. Drop getSearchTotals from the @/data/gsc/queries import.
7. load-signals.ts: change the import path to './range-reads'.
8. page-coverage.test.ts: change the import path and pin getDegradationByCallerShared and getSearchTotalsShared next to the existing two.
9. Leave last-synced.ts, queue-stats-shared.ts and statics-review-shared.ts unchanged.

**Tests.** Add src/app/(site)/admin/range-reads.test.ts. It calls getDegradationByCallerShared and getSearchTotalsShared with a range, with the data modules mocked, and asserts the underlying read gets Dates equal to the input from/to and its value is returned. In vitest, React's non-server build makes cache() a passthrough (node_modules/react/cjs/react.development.js:917-921), so assert forwarding only, not dedupe. Update ops-view.test.ts:56-73 by removing the fallback and degradationByCaller fixture fields. SQL behavior stays guarded by src/data/telemetry/queries.db.test.ts (getDegradationByCaller at 86-87) and the gsc query tests.

**Notes.** Behavior to preserve: loadSection wraps each card, so a failed shared read still fails only the cards that await it. cache() shares a rejected promise too, so PressureCard and PriceSourceCard would now fail together on a degradation-query error, where before they failed independently. That is acceptable, and identical to how getFallbackRateShared already behaves. Keep ISO-string keys even though today each page passes one range object: the overview's loadAdminSignals builds its own range (load-signals.ts:27), and object-identity keys would silently stop deduping if a card ever derives its own range. Drift found: deriveCostLensView carried a dead input (degradationByCaller) and a dead output (fallback). The renderer (CostCards) is the correct consumer contract, so remove both.

<sub>Reported by: area:app-site.</sub>

<a id="p158"></a>

## P158: Share the admin cron, SLI and activity loaders between the overview, health and traffic cards

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about −55 / +30 (net −25 across 5 files plus 1 new file)
- **Depends on:** —
- **Existing primitive:** `src/app/(site)/admin/load-signals.ts:loadAdminSignals`

**Problem.** The admin overview builds the cron bundle (getLastCronRuns, four get*CronOutcomes, getLastSyncedAt when GSC is configured) and the SLI bundle (four per-read loadSection calls) in load-signals.ts. The health page repeats both: ScheduledTasks rebuilds the CronSignals object field by field before deriveCronStatuses, and ServiceLevelsCard re-lists the four SLI reads and their labels. The activity chart load (daily counts, previous-range counts, deploy markers, deriveActivityView) is written twice, once in AudienceCard and once in the traffic ActivityCard. Adding a cron or an SLI means editing each copy in step.

**Verifier revision.** The core holds. The six-read cron bundle and the CronSignals object are built by hand in load-signals.ts and again in ScheduledTasks.tsx. The four loadSection-wrapped SLI reads, with identical labels, appear in load-signals.ts and in HealthCards.ServiceLevelsCard. Both feed the same derivations (deriveCronStatuses(CronSignals), deriveServiceLevels(SliSignals)). The daily-counts, previous-counts, deploy-markers and deriveActivityView sequence is identical in AudienceCard and ActivityCard. The design needs two changes. (a) Drop React cache(). The overview's loadAdminSignals is already cache()d per rangeKey, and the health page calls each loader exactly once per request. The overview and health pages are separate requests, and rangeFor() creates a new DateRange with a new `now` on every call, so a range-keyed cache would never hit. (b) Do not put loadActivityView in activity-view.ts. That module is pure (types plus derivation) and its test imports it without mocks, so the loader belongs in a new admin-local loader file.

**Sites (7).**

- [`src/app/(site)/admin/load-signals.ts:26-72`](../../src/app/%28site%29/admin/load-signals.ts#L26-L72) — cron bundle 30-49 (gscConfigured read once at 28); SLI bundle 53-61 with labels getReadSuccessRate, getMutationSuccessRate, getCriticalLatencyP95, getEsiSuccessRate
- [`src/app/(site)/admin/health/ScheduledTasks.tsx:140-168`](../../src/app/%28site%29/admin/health/ScheduledTasks.tsx#L140-L168) — same six reads plus getRefreshVolume inside one loadSection('scheduled-tasks') at 141-152; CronSignals rebuilt at 157-168; gscConfigured and lastSyncedAt also feed GscSyncDetail at 196-202
- [`src/app/(site)/admin/health/HealthCards.tsx:31-47`](../../src/app/%28site%29/admin/health/HealthCards.tsx#L31-L47) — same four loadSection-wrapped SLI reads (34-37) inside loadSection('service-levels'); deriveServiceLevels takes the SliSignals shape at 44-47
- [`src/app/(site)/admin/AudienceCard.tsx:22-66`](../../src/app/%28site%29/admin/AudienceCard.tsx#L22-L66) — activity reads at 37-39 (maybe(hasPrev, …) for previous counts) within a 9-item tuple; deriveActivityView at 66
- [`src/app/(site)/admin/traffic/TrafficCards.tsx:57-74`](../../src/app/%28site%29/admin/traffic/TrafficCards.tsx#L57-L74) — same three reads (prev ? … : Promise.resolve(null)) and the same deriveActivityView
- [`src/app/(site)/admin/signals.ts:29-44`](../../src/app/%28site%29/admin/signals.ts#L29-L44) — CronSignals and SliSignals interfaces are already the shared contract
- [`src/app/(site)/admin/health/health-view.ts:51-57`](../../src/app/%28site%29/admin/health/health-view.ts#L51-L57) — deriveServiceLevels(sli: SliSignals, …), which confirms the SLI loader can return SliSignals for both callers

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/load-signals.ts:50-52, 62-69`](../../src/app/%28site%29/admin/load-signals.ts#L50-L52) — budget, fallback, queue, statics and releases sections are overview-only
- [`src/app/(site)/admin/health/HealthCards.tsx:56-78`](../../src/app/%28site%29/admin/health/HealthCards.tsx#L56-L78) — loadServiceLevelDetails is health-only detail and stays where it is
- [`src/app/(site)/admin/traffic/TrafficCards.tsx:113-118`](../../src/app/%28site%29/admin/traffic/TrafficCards.tsx#L113-L118) — PilotsCard repeats getReturningVsNew/getSearchVsDirect from AudienceCard but derives a different view; not the same concept

</details>

**Home.** `src/app/(site)/admin/load-signals.ts for loadCronSignals and loadSliSignals; new src/app/(site)/admin/load-activity.ts for loadActivityView`

**Boundary check.** Every file involved is in the 'app' zone (src/app/**): load-signals.ts, load-activity.ts, health/ScheduledTasks.tsx, health/HealthCards.tsx, AudienceCard.tsx and traffic/TrafficCards.tsx. Same-zone imports are unrestricted. The loaders import @/data/telemetry/queries and @/data/gsc/constants (rule 'app' allows 'data'), @/composition/admin-period (allows 'composition'), and ./deploy-markers, which reaches @/features/changelog (allows 'features'). No new cross-zone edges.

**API sketch.**

```ts
// src/app/(site)/admin/load-signals.ts
export async function loadCronSignals(range: DateRange): Promise<CronSignals>; // throws if any read fails; caller wraps in loadSection
export async function loadSliSignals(range: DateRange): Promise<SliSignals>;   // never throws; each SLI is its own loadSection mark
// src/app/(site)/admin/load-activity.ts
export async function loadActivityView(rangeKey: RangeKey, range: DateRange): Promise<ActivityChartData>;
```

**Migration steps.**

1. In load-signals.ts, move the body of the 'admin-signals.crons' section (lines 31-48) into an exported loadCronSignals(range). It calls isGscConfigured() itself and returns CronSignals. loadAdminSignals becomes loadSection('admin-signals.crons', () => loadCronSignals(range)).
2. Move lines 54-60 into an exported loadSliSignals(range), keeping the four loadSection labels verbatim. loadAdminSignals becomes loadSection<SliSignals>('admin-signals.sli', () => loadSliSignals(range)).
3. ScheduledTasks.tsx: replace 141-168 with loadSection('scheduled-tasks', () => Promise.all([loadCronSignals(range), getRefreshVolume(range)])), then `const [crons, refreshVolume] = fetched; const statuses = deriveCronStatuses(crons, range.to)`. Feed `toned` from crons.*Outcomes and pass crons.gscConfigured and crons.gscLastSyncedAt to GscSyncDetail. Delete the imports of the four cron-outcome queries, getLastCronRuns, isGscConfigured and getLastSyncedAtShared.
4. HealthCards.tsx ServiceLevelsCard: replace the four reads at 34-37 with one loadSliSignals(range) entry and destructure [sli, queueStats, details]. Call deriveServiceLevels(sli, summarizeQueue(queueStats, range.to)). Drop the four SLI query imports and keep MUTATION_EXCLUDED_OUTCOMES.
5. Create load-activity.ts with loadActivityView(rangeKey, range): prev = previousRange(rangeKey, range); await Promise.all([getDailyCounts(range), prev ? getDailyCounts(prev) : Promise.resolve(null), loadDeployMarkers()]); return deriveActivityView({ range, dailyCounts, prevDailyCounts, markers }). Leave activity-view.ts pure.
6. AudienceCard.tsx: remove tuple entries 37-39 and line 66 and add loadActivityView(rangeKey, range) as one tuple entry inside the existing loadSection('audience'). Drop the getDailyCounts, loadDeployMarkers and deriveActivityView imports.
7. TrafficCards.tsx ActivityCard: loadSection('traffic-activity', () => loadActivityView(rangeKey, range)). Drop its getDailyCounts, previousRange, loadDeployMarkers and deriveActivityView imports.
8. Do not add React cache() to the new loaders.

**Tests.** Existing guards: src/app/(site)/admin/AudienceCard.test.ts mocks '@/data/telemetry/queries' and './deploy-markers'. vi.mock is module-wide, so load-activity.ts picks up the mocks and the test keeps passing unchanged. src/app/(site)/page-coverage.test.ts renders ScheduledTasks, ServiceLevelsCard, ActivityCard and loadAdminSignals; signals.test.ts and health/health-view.test.ts cover the derivations. Add src/app/(site)/admin/load-signals.test.ts. It should check that loadCronSignals skips getLastSyncedAtShared and sets gscConfigured=false when GSC env is unset, that loadCronSignals rejects when one read rejects, that loadSliSignals marks only the failing SLI as SECTION_LOAD_FAILED, and that loadActivityView passes prevDailyCounts=null for rangeKey 'all'. These cases keep fallow coverage-gaps satisfied for the new exports.

**Notes.** Failure semantics to preserve: the cron bundle is all-or-nothing in both places (ScheduledTasks' 'scheduled-tasks' section and the overview's 'admin-signals.crons' section), so loadCronSignals must throw rather than mark individual reads. The SLI reads keep per-read SECTION_LOAD_FAILED marks, because ServiceLevelRows and sliLine read them per row. isGscConfigured() must drive both the conditional getLastSyncedAtShared read and the gscConfigured field, as both copies do today. No drift found between the copies; the activity copies differ only in maybe() vs a ternary for the previous range, which are equivalent. Once the SLI reads are individually wrapped, the outer loadSection('admin-signals.sli') can never return SECTION_LOAD_FAILED. Narrowing AdminSignals.sli from Loaded<SliSignals> to SliSignals would be an optional follow-up that touches signals.ts:55 and 182-183. Adding a cron still touches CronSignals, deriveCronStatuses, CRON_OUTCOME_RULES, cronLines and the ScheduledTasks rows; this change removes only the duplicated loader and the hand-built object.

<sub>Reported by: area:app-site.</sub>

<a id="p299"></a>

## P299: Build the ESI budget card on deriveBudgetStatus, drop the dead cost-lens inputs, and share admin job-count and age helpers

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -60 production lines (deriveBudgetView 38, countOf/ageLabel 16, three inline sums, dead cost-lens fields) and +20 (countJobs, formatAge, queueValueText, deriveBudgetCard details, shared degradation loader); tests about -20 net
- **Depends on:** [P281](#p281), [P091](wave-04-formatting-dates-and-names-have-one-home.md#p091), [P085](wave-04-formatting-dates-and-names-have-one-home.md#p085), [P088](wave-04-formatting-dates-and-names-have-one-home.md#p088)
- **Existing primitive:** `src/app/(site)/admin/signals.ts:deriveBudgetStatus`

**Problem.** Admin view-models derive the same facts several ways. The ESI_BUDGET_FLOOR verdict is computed by deriveBudgetStatus (signals.ts) and again by deriveBudgetView (ops-view.ts), and BudgetCard calls both plus deriveBudgetGauge. It reads level/pct from the gauge and headline/metrics from the view, ignores view.level and gauge.note, and slices off metrics[0] ('Effective remaining', which the gauge already shows). The headline wording has drifted: the overview says 'floor 20 · live' and the card says 'floor 20'. deriveCostLensView takes degradationByCaller and never reads it, and returns fallback, which CostCards never renders. So loadCost runs an uncached getDegradationByCaller query for nothing, and any failure in that query or the fallback read blanks the whole 'ESI cost' section. 'Sum stat.count for these statuses' appears four times: countOf in queue-view, the loop in summarizeQueue, heldForBudgetLine, and derivePressureLines. The '${due} active · ${dead} dead' text appears twice, and the m/h/d age formatter twice. getDegradationByCaller also runs separately in PressureCard and PriceSourceCard for the same range on one page.

**Verifier revision.** The core claims hold. BudgetCard builds two view-models and uses only part of each: gauge.note and view.level go unread, and view.metrics.slice(1) throws away a row on every render. deriveCostLensView reads neither degradationByCaller nor (in CostCards) its fallback output. 'Sum job counts by status' is written four times and the queue value text twice. The proposed design is changed in three ways. (1) Do not grow deriveBudgetStatus into a 6-field object: the overview line only needs {level,value,note}. Keep it as the single floor verdict and build one card view-model in esi-view on top of it. (2) Put countJobs/queueValueText in signals.ts, not queue/queue-view.ts. signals.ts is already the hub that esi-view and health-view import from ../signals. (3) Add two sites the finders missed. formatHours (signals.ts 217-221) and ageLabel (queue-view.ts 18-24) are the same m/h/d age formatter with identical output. getDegradationByCaller runs uncached three times per ESI page render (PressureCard, PriceSourceCard, loadCost), while its siblings already go through React cache() in esi-source-shared.ts.

**Sites (16).**

- [`src/app/(site)/admin/signals.ts:193-211`](../../src/app/%28site%29/admin/signals.ts#L193-L211) — BudgetStatus + deriveBudgetStatus: the canonical floor verdict (green note 'floor N · live', null note 'dispatch paused'); used by budgetLine (318-321) and deriveBudgetGauge
- [`src/app/(site)/admin/ops-view.ts:19-56`](../../src/app/%28site%29/admin/ops-view.ts#L19-L56) — deriveBudgetView repeats the floor check (27). Headline drifts: 'floor N' when green; null gives 'Scoreboard unavailable · dispatch paused'. metrics[0] 'Effective remaining' duplicates gauge.remaining
- [`src/app/(site)/admin/esi/esi-view.ts:14-26`](../../src/app/%28site%29/admin/esi/esi-view.ts#L14-L26) — deriveBudgetGauge wraps deriveBudgetStatus; its note field goes unread by BudgetCard
- [`src/app/(site)/admin/esi/EsiCards.tsx:39-64`](../../src/app/%28site%29/admin/esi/EsiCards.tsx#L39-L64) — BudgetCard calls both derivations, uses gauge.level/remaining/ceiling/pct plus view.headline and view.metrics.slice(1)
- [`src/app/(site)/admin/ops-view.ts:69-126`](../../src/app/%28site%29/admin/ops-view.ts#L69-L126) — deriveCostLensView: input.degradationByCaller (76) never read; input.fallback (74) only copied into the returned fallback (121-124)
- [`src/app/(site)/admin/esi/EsiCards.tsx:133-176`](../../src/app/%28site%29/admin/esi/EsiCards.tsx#L133-L176) — loadCost fetches getFallbackRateShared and uncached getDegradationByCaller (141,143) only for those fields; CostCards reads view.metrics and view.endpoints only
- [`src/app/(site)/admin/esi/EsiCards.tsx:66-75, 90-93`](../../src/app/%28site%29/admin/esi/EsiCards.tsx#L66-L75) — PressureCard and PriceSourceCard each call uncached getDegradationByCaller(range); with loadCost that is three identical queries per render
- [`src/app/(site)/admin/esi-source-shared.ts:1-22`](../../src/app/%28site%29/admin/esi-source-shared.ts#L1-L22) — Existing per-request cache() pattern for getFallbackRate/getBudgetExhaustionCount; degradation is missing from it
- [`src/data/telemetry/queries.ts:263-278`](../../src/data/telemetry/queries.ts#L263-L278) — getDegradationByCaller: a GROUP BY over usage_logs, not cached
- [`src/app/(site)/admin/queue/queue-view.ts:18-34`](../../src/app/%28site%29/admin/queue/queue-view.ts#L18-L34) — ageLabel (18-24) and countOf (26-34): status-set count plus oldest
- [`src/app/(site)/admin/signals.ts:213-221`](../../src/app/%28site%29/admin/signals.ts#L213-L221) — elapsedHours + formatHours: same m/h/d thresholds as ageLabel (<60m, <48h, else days), identical output
- [`src/app/(site)/admin/signals.ts:232-244`](../../src/app/%28site%29/admin/signals.ts#L232-L244) — summarizeQueue re-implements countOf over LIVE_ESI_REFRESH_JOB_STATUSES plus a dead_lettered count
- [`src/app/(site)/admin/signals.ts:252-264`](../../src/app/%28site%29/admin/signals.ts#L252-L264) — queueLine value text '${due} active · ${dead} dead' (256)
- [`src/app/(site)/admin/signals.ts:292-305`](../../src/app/%28site%29/admin/signals.ts#L292-L305) — heldForBudgetLine: filter deferred_for_budget then reduce (294-296)
- [`src/app/(site)/admin/esi/esi-view.ts:64-68`](../../src/app/%28site%29/admin/esi/esi-view.ts#L64-L68) — derivePressureLines: same deferred_for_budget filter/reduce
- [`src/app/(site)/admin/health/health-view.ts:35-42`](../../src/app/%28site%29/admin/health/health-view.ts#L35-L42) — measure('job_backlog') repeats the queueLine value text verbatim

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/lib/format/time.ts:33-48`](../../src/lib/format/time.ts#L33-L48) — formatRelativeTime has different thresholds (h until 24, then d/w/mo) and an 'ago' suffix. It cannot replace formatHours/ageLabel without changing admin text
- [`src/app/(site)/admin/queue/queue-view.ts:48-52`](../../src/app/%28site%29/admin/queue/queue-view.ts#L48-L52) — retainedSummary is a legitimate countOf consumer and should switch to countJobs, not be merged into anything
- [`src/app/(site)/admin/ops-view.ts:58-67, 128-141`](../../src/app/%28site%29/admin/ops-view.ts#L58-L67) — deriveDeadLetterView and summarizeDomainEvent are unrelated to the budget/cost duplication; leave them in ops-view
- [`src/features/skill-queue/progress.ts:43`](../../src/features/skill-queue/progress.ts#L43) — A different summarizeQueue (skill training queue); a name collision only

</details>

**Home.** `src/app/(site)/admin/signals.ts (countJobs, formatAge, queueValueText); src/app/(site)/admin/esi/esi-view.ts (deriveBudgetCard replaces deriveBudgetGauge + deriveBudgetView); src/app/(site)/admin/esi-source-shared.ts (getDegradationByCallerShared)`

**Boundary check.** Every file involved is in the 'app' zone (pattern src/app/**): signals.ts, esi-view.ts, queue-view.ts, health-view.ts, ops-view.ts, EsiCards.tsx, esi-source-shared.ts. Imports between them are intra-zone. The only cross-zone imports already exist and stay legal under rule {from:'app', allow:[..., 'platform/esi', 'data', ...]}: @/data/esi-refresh-jobs/{types,constants}, @/data/telemetry/{queries,types,health-metrics}, @/platform/esi and @/platform/esi/scoreboard. No new cycle: queue-view.ts and esi-view.ts import ../signals; signals.ts imports only ./load-section from admin.

**API sketch.**

```ts
// signals.ts
export function countJobs(stats: EsiRefreshQueueStat[], statuses: readonly EsiRefreshJobStatus[]): { count: number; oldest: Date | null };
export function formatAge(from: Date, now: Date): string; // = formatHours(elapsedHours(from, now))
export function queueValueText(queue: QueueSummary): string; // `${due} active · ${dead} dead`
// esi/esi-view.ts
export interface BudgetCardView { level: StatusLevel; remaining: string; ceiling: number; pct: number; headline: string; details: OpsMetricRow[] }
export function deriveBudgetCard(snapshot: EsiBudgetSnapshot | null): BudgetCardView;
// ops-view.ts
export function deriveCostLensView(input: { prices: PriceSourceSplit; history: HistorySourceSplit; writeBehind: WriteBehindOutcome[]; endpoints: CostlyEndpoint[]; budgetExhaustions: number }): { metrics: OpsMetricRow[]; endpoints: { key: string; label: string; count: number }[] };
// esi-source-shared.ts
export function getDegradationByCallerShared(range: DateRange): Promise<DegradationCallerCount[]>;
```

**Migration steps.**

1. signals.ts: add exported countJobs, moving the body of queue-view countOf (26-34) and typing statuses as readonly EsiRefreshJobStatus[]. Rewrite summarizeQueue as live = countJobs(stats, LIVE_ESI_REFRESH_JOB_STATUSES) and deadLettered = countJobs(stats, ['dead_lettered']).count, keeping oldestDueHours = live.oldest === null ? null : elapsedHours(live.oldest, now). Rewrite heldForBudgetLine to use countJobs(stats, ['deferred_for_budget']).count.
2. signals.ts: add exported queueValueText(queue) and use it in queueLine (256). Add exported formatAge(from, now) = formatHours(elapsedHours(from, now)); keep formatHours private for queueLine/queueAttention, which already hold hours.
3. queue/queue-view.ts: delete countOf and ageLabel; import countJobs and formatAge from '../signals'; deriveQueueCells and retainedSummary call them.
4. health/health-view.ts: measure('job_backlog') uses queueValueText(queue) (it already imports queueLevel/QueueSummary from ../signals).
5. esi/esi-view.ts: derivePressureLines computes deferred as countJobs(input.queue, ['deferred_for_budget']).count.
6. esi/esi-view.ts: replace deriveBudgetGauge with deriveBudgetCard. Take level from deriveBudgetStatus. headline = snapshot === null ? 'Scoreboard unavailable · dispatch paused' : deriveBudgetStatus(snapshot).note. remaining, ceiling and pct work as today. details = the three rows now at ops-view.ts 39-53 (Observed HTTP errors, Lowest recent CCP allowance, Scoreboard source), or [] when the snapshot is null.
7. EsiCards.tsx BudgetCard: call deriveBudgetCard once; render card.headline and <MetricList rows={card.details} /> when details.length > 0; drop the slice(1). Delete deriveBudgetView from ops-view.ts.
8. ops-view.ts: remove fallback and degradationByCaller from deriveCostLensView's input, remove the returned fallback, and drop the DegradationCallerCount/FallbackRateData imports. EsiCards.tsx loadCost: drop getFallbackRateShared and getDegradationByCaller from its Promise.all.
9. esi-source-shared.ts: add getDegradationByCallerShared, a cache() keyed on ISO strings like readFallbackRate. Switch PressureCard and PriceSourceCard to it, so the ESI page runs one degradation query instead of three.

**Tests.** Existing guards: signals.test.ts 74-104 (deriveBudgetStatus, summarizeQueue), 143 ('0 active · 0 dead'), 200-215 and 246-252 (held-for-budget); health-view.test.ts 23 and 29 (job_backlog text); queue-view.test.ts (cell counts and 'oldest job' age labels); esi-view.test.ts 12-28 (gauge) and the derivePressureLines 'held jobs' case; ops-view.test.ts 11-30 (deriveBudgetView) and 56-74 (deriveCostLensView). Changes: rename the esi-view gauge tests to deriveBudgetCard. Add assertions for headline ('floor 20 · live' when green; 'Scoreboard unavailable · dispatch paused' when null) and for details (3 rows; last row value 'process-local', moved from ops-view.test.ts 20-29). Delete the deriveBudgetView describe block. Drop fallback/degradationByCaller from the deriveCostLensView fixture. Add signals.test cases for countJobs (multi-status sum and oldest; empty gives {0, null}) and formatAge boundaries (59m gives '59m', 60m gives '1h', 47h gives '47h', 48h gives '2d') so the merged formatter keeps queue-view's labels.

**Notes.** Behavior to preserve: summarizeQueue's 'oldest' comes only from live statuses, and dead_lettered is counted separately but excluded from due. countJobs over LIVE_ESI_REFRESH_JOB_STATUSES gives exactly that. formatHours and ageLabel give identical strings for every input (both floor to minutes <60, hours <48, else days), so either can be canonical. Deliberate wording change: the card's green headline becomes 'floor N · live' (deriveBudgetStatus.note), matching the overview's Error budget line. The null-snapshot headline must keep 'Scoreboard unavailable' because the gauge shows only '—' there. Drift/bug fixed: CostCards no longer fails as 'ESI cost unavailable' when the unrelated degradation or fallback read fails. The fallback read was already React-cached, so it cost no extra query, but it still coupled failures. Do not add metrics or pct to deriveBudgetStatus; the overview StatusLine spreads its result into {id,label,...}, so extra fields would leak into StatusLine objects.

<sub>Reported by: area:app-site.</sub>

<a id="p314"></a>

## P314: Trim admin and corporations view models to rendered fields and show search truncation in the results body

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -25 / +8
- **Depends on:** —

**Problem.** deriveAccessView computes adminCount, adminPlural, querySuffix, hasQuery, searchTruncated and resultsHint, but only tests read them. The page reads only nonAdminMatches. searchUsersByLinkedCharacterName fetches CHARACTER_SEARCH_LIMIT + 1 rows only so truncation can be detected. Commit 91d8a95 removed the header hint, so when more than 50 accounts match, admins get a list cut at 50 with no sign that more exist. deriveCorporationsView still builds membershipHint, which the same commit stopped rendering.

**Verifier revision.** The dead code is real. deriveAccessView returns seven fields and page.tsx:246-261 reads only nonAdminMatches. corporations-view.membershipHint is read only by its test. The proposed fix is wrong, though. Commit 91d8a95 ("Simplify settings descriptions and card headers") deliberately removed resultsHint from the Search results SectionHeader, along with membershipHint, the Admins count hint and the audit hint, and moved the Sessions count into body copy. Putting the hints back in headers would undo a design decision. Two parts survive: delete the dead fields, and fix the one real loss in that commit. The truncation signal went with the header, so the limit+1 fetch in searchUsersByLinkedCharacterName now detects truncation and nothing shows it. Show it in the card body, not the header. Delete membershipHint; do not re-render it.

**Sites (8).**

- [`src/app/(site)/admin/users/access-view.ts:51-81`](../../src/app/%28site%29/admin/users/access-view.ts#L51-L81) — deriveAccessView returns 7 fields; the query param exists only for querySuffix/hasQuery
- [`src/app/(site)/admin/users/page.tsx:201-231`](../../src/app/%28site%29/admin/users/page.tsx#L201-L231) — SearchResultsCard: SectionHeader has no hint and the body has no truncation note
- [`src/app/(site)/admin/users/page.tsx:246-261`](../../src/app/%28site%29/admin/users/page.tsx#L246-L261) — Only view.nonAdminMatches is consumed
- [`src/platform/auth/admin-users.ts:123-150`](../../src/platform/auth/admin-users.ts#L123-L150) — CHARACTER_SEARCH_LIMIT = 50; .limit(CHARACTER_SEARCH_LIMIT + 1) exists only to detect truncation
- [`src/app/(site)/admin/users/access-view.test.ts:88-115`](../../src/app/%28site%29/admin/users/access-view.test.ts#L88-L115) — Asserts hasQuery, querySuffix, resultsHint, adminCount and adminPlural, none of which production reads
- [`src/app/(site)/settings/corporations/corporations-view.ts:20-25, 63-70`](../../src/app/%28site%29/settings/corporations/corporations-view.ts#L20-L25) — membershipHint is in the type and the deriver
- [`src/app/(site)/settings/corporations/page.tsx:50-53`](../../src/app/%28site%29/settings/corporations/page.tsx#L50-L53) — MembershipsCard renders SectionHeader without a hint (removed in 91d8a95)
- [`src/app/(site)/settings/corporations/corporations-view.test.ts:69-77`](../../src/app/%28site%29/settings/corporations/corporations-view.test.ts#L69-L77) — Only reader of membershipHint

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/users/[userId]/user-detail-view.ts:6-25`](../../src/app/%28site%29/admin/users/[userId]/user-detail-view.ts#L6-L25) — Checked for the same pattern: page.tsx reads all five fields (lines 169-205)

</details>

**Home.** `Stays in place: src/app/(site)/admin/users/access-view.ts and src/app/(site)/settings/corporations/corporations-view.ts (app zone). No new primitive.`

**Boundary check.** All files are in the app zone. page.tsx already imports from platform/auth/admin-users (app may import platform/auth). Showing CHARACTER_SEARCH_LIMIT in copy uses the same allowed import. No new cross-zone edges.

**API sketch.**

```ts
export function deriveAccessView(opts: { adminRows: ReadonlyArray<{ user: { userId: string } }>; searchResults: AdminUser[] }): { nonAdminMatches: AdminUser[]; searchTruncated: boolean }
function SearchResultsCard(props: { nonAdminMatches: AdminUser[]; searchTruncated: boolean; query: string; viewerUserId: string })
export type CorporationsView = { directorCorps: SharingCorpView[]; memberCorps: SharingCorpView[]; memberships: CorporationMembershipView[] }
```

**Migration steps.**

1. access-view.ts: remove adminCount, adminPlural, querySuffix, hasQuery and resultsHint from deriveAccessView's return type and body. Drop the now-unused `query` option. Keep the slice-then-filter logic and searchTruncated.
2. page.tsx: call deriveAccessView({ adminRows, searchResults }). Pass view.searchTruncated to SearchResultsCard.
3. SearchResultsCard: when searchTruncated is true, render a footer under the rows, styled like the existing border-t muted footers (e.g. corporations/page.tsx MembershipsCard footer): 'More accounts match; showing the first 50 results. Narrow your search.' Keep the SectionHeader without a hint, per 91d8a95.
4. corporations-view.ts: delete membershipHint from CorporationsView and deriveCorporationsView.
5. Update access-view.test.ts (drop the dead-field assertions; keep the nonAdminMatches filter, the 50-row cap and searchTruncated) and corporations-view.test.ts (drop the three membershipHint expects).
6. If the product owner prefers no truncation notice, also remove searchTruncated and change .limit(CHARACTER_SEARCH_LIMIT + 1) to .limit(CHARACTER_SEARCH_LIMIT) in admin-users.ts. The +1 fetch must not stay without a reader.

**Tests.** access-view.test.ts: keep and extend 'filters admins from search, truncates past the cap', asserting searchTruncated true for 51 results and false for 50. corporations-view.test.ts: remove the membershipHint expects. Optional: a prerender test of SearchResultsCard showing the footer only when truncated, using the same prerender pattern as admin-console.test.ts.

**Notes.** Copy drift: the old resultsHint said 'showing first 50' next to nonAdminMatches.length. But truncation is detected on raw results, which include admins, and the cap is applied before admins are filtered out, so the visible list can be shorter than 50 while truncated. New copy should describe the search cap, not the visible count. The 91d8a95 header-simplification is intentional; do not restore header hints.

<sub>Reported by: area:app-site.</sub>

<a id="p315"></a>

## P315: Derive admin hrefs, titles and range controls from admin-sections instead of literals

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** low · **Size:** about -35 / +25
- **Depends on:** [P316](#p316)
- **Existing primitive:** `src/app/(site)/admin/admin-sections.ts:ADMIN_NAV_GROUPS`

**Problem.** Within app/(site)/admin there are about 27 hard-coded admin URLs beside the ADMIN_NAV_GROUPS table that already owns them. AdminPageFrame takes a title and rangeBasePath that duplicate each section's title, href and `ranged` flag, so whether a page shows a range control is decided in two places. admin-console.test.ts already passes rangeBasePath for the non-ranged statics page. The '#scheduled' anchor is a literal in signals.ts three times and an id in ScheduledTasks.tsx, with no shared constant. Drift: the overview and traffic cards link to ranged pages (traffic, search) without the viewer's range, while the rail preserves it.

**Verifier revision.** The core holds. admin-sections.ts is the canonical table of admin ids, hrefs, titles and the `ranged` flag. Yet app/(site)/admin repeats every href as a literal (12 in signals.ts alone, with '/admin/health#scheduled' and '/admin/queue' three times each). All 8 AdminPageFrame call sites repeat the section title. The 5 ranged pages repeat both the href and the `ranged` fact through rangeBasePath. Two parts of the proposal are wrong. (1) Sites outside the app zone (api routes, composition/search/commands-source.ts, components/composition/account/*) cannot import from app/(site)/admin under .fallowrc.json, so the table cannot cover them. (2) The optional RangedAdminContent adds indirection for one shared expression; each Content uses rangeKey and range differently (search parses the key before the GSC check and builds searchPeriods; health and esi need only range). Drop it. The extraction is also worth more than the proposal says: there is a real drift. The rail carries the viewer's ?range onto ranged pages (adminSectionHref), but in-card links to ranged pages drop it.

**Sites (22).**

- [`src/app/(site)/admin/admin-sections.ts:17, 39-92, 105-114`](../../src/app/%28site%29/admin/admin-sections.ts#L17) — USERS_HREF, section(), ADMIN_NAV_GROUPS (ids, hrefs, titles, ranged), rangeHref and adminSectionHref
- [`src/app/(site)/admin/signals.ts:61-74`](../../src/app/%28site%29/admin/signals.ts#L61-L74) — HEALTH_PAGE, ESI_PAGE and the SOURCES table with literal hrefs, including '/admin/health#scheduled'
- [`src/app/(site)/admin/signals.ts:340-376`](../../src/app/%28site%29/admin/signals.ts#L340-L376) — deriveStatusGroups hard-codes '/admin/health', '/admin/esi' and '/admin/health#scheduled'
- [`src/app/(site)/admin/signals.ts:391-423`](../../src/app/%28site%29/admin/signals.ts#L391-L423) — staticsAttention and queueAttention hard-code '/admin/statics' and '/admin/queue' (twice)
- [`src/app/(site)/admin/signals.ts:459-464`](../../src/app/%28site%29/admin/signals.ts#L459-L464) — deriveAttention repeats { label: 'View jobs', href: '/admin/health#scheduled' } from line 66
- [`src/app/(site)/admin/actions-view.ts:18-62`](../../src/app/%28site%29/admin/actions-view.ts#L18-L62) — Repeats the titles 'Refresh queue', 'Users & roles' and 'Wormhole statics' and their hrefs from the nav table
- [`src/app/(site)/admin/AccountsCard.tsx:17`](../../src/app/%28site%29/admin/AccountsCard.tsx#L17) — Literal '/admin/users' although USERS_HREF exists
- [`src/app/(site)/admin/AudienceCard.tsx:72-77`](../../src/app/%28site%29/admin/AudienceCard.tsx#L72-L77) — CardLinks to '/admin/traffic' and '/admin/search' drop the rangeKey the card receives
- [`src/app/(site)/admin/traffic/TrafficCards.tsx:101, 125`](../../src/app/%28site%29/admin/traffic/TrafficCards.tsx#L101) — '/admin/search' (ranged, range dropped) and '/admin/users' literals
- [`src/app/(site)/admin/esi/EsiCards.tsx:83`](../../src/app/%28site%29/admin/esi/EsiCards.tsx#L83) — '/admin/queue' literal
- [`src/app/(site)/admin/health/ServiceLevelRows.tsx:195`](../../src/app/%28site%29/admin/health/ServiceLevelRows.tsx#L195) — '/admin/queue' literal
- [`src/app/(site)/admin/health/ScheduledTasks.tsx:181`](../../src/app/%28site%29/admin/health/ScheduledTasks.tsx#L181) — Card id="scheduled": the anchor target of the three signals.ts literals
- [`src/app/(site)/admin/AdminFrame.tsx:9-41`](../../src/app/%28site%29/admin/AdminFrame.tsx#L9-L41) — AdminPageFrame takes title and rangeBasePath separately
- [`src/app/(site)/admin/page.tsx:33-43`](../../src/app/%28site%29/admin/page.tsx#L33-L43) — title 'Overview', rangeBasePath '/admin'
- [`src/app/(site)/admin/health/page.tsx:24-34`](../../src/app/%28site%29/admin/health/page.tsx#L24-L34) — title and rangeBasePath duplicate the table
- [`src/app/(site)/admin/esi/page.tsx:28-38`](../../src/app/%28site%29/admin/esi/page.tsx#L28-L38) — Same
- [`src/app/(site)/admin/traffic/page.tsx:24-34`](../../src/app/%28site%29/admin/traffic/page.tsx#L24-L34) — Same
- [`src/app/(site)/admin/search/page.tsx:36-46`](../../src/app/%28site%29/admin/search/page.tsx#L36-L46) — Same
- [`src/app/(site)/admin/queue/page.tsx:4-18`](../../src/app/%28site%29/admin/queue/page.tsx#L4-L18) — title 'Refresh queue' duplicates the table
- [`src/app/(site)/admin/statics/page.tsx:300-313`](../../src/app/%28site%29/admin/statics/page.tsx#L300-L313) — title 'Wormhole statics' duplicates the table
- [`src/app/(site)/admin/users/page.tsx:269-279`](../../src/app/%28site%29/admin/users/page.tsx#L269-L279) — title 'Users & roles' duplicates the table
- [`src/app/(site)/admin/admin-console.test.ts:32-40`](../../src/app/%28site%29/admin/admin-console.test.ts#L32-L40) — Test frame passes rangeBasePath '/admin/statics' for a non-ranged section, showing the two-sources drift

<details><summary>Excluded sites (not the same concept)</summary>

- `src/app/api/admin/*/route.ts:role/route.ts:22, esi-jobs/retry/route.ts:41, wh-statics/route.ts:19, sessions/revoke/route.ts:53, characters/reassign/route.ts:75, characters/unlink/route.ts:17` — api zone may not import app (the api allow list lacks app). Redirect literals stay, unless a site-wide route table is ever put in lib.
- [`src/composition/search/commands-source.ts:33-72`](../../src/composition/search/commands-source.ts#L33-L72) — composition may not import app. It also holds non-admin routes (/legal, /settings/characters), so it is a site-wide concern.
- [`src/components/composition/account/account-menu-items.tsx:59`](../../src/components/composition/account/account-menu-items.tsx#L59) — components-composition may not import app
- [`src/components/composition/account/LoginButton.tsx:19`](../../src/components/composition/account/LoginButton.tsx#L19) — components-composition may not import app
- [`src/app/robots.ts:10`](../../src/app/robots.ts#L10) — Prefix rule, not a section link
- [`src/components/telemetry/page-view-metadata.ts:3`](../../src/components/telemetry/page-view-metadata.ts#L3) — Prefix rule in the components zone
- [`src/app/(site)/admin/page.tsx:9-31`](../../src/app/%28site%29/admin/page.tsx#L9-L31) — Fallow groups 43c11584 and 70d6f771 match identifier-blind AdminSlot JSX with different cards and labels. Not the same concept; no RangedAdminContent.

</details>

**Home.** `src/app/(site)/admin/admin-sections.ts (existing primitive, app zone), plus a section prop on src/app/(site)/admin/AdminFrame.tsx`

**Boundary check.** Every consumer (signals.ts, actions-view.ts, AccountsCard, AudienceCard, TrafficCards, EsiCards, ServiceLevelRows, ScheduledTasks, AdminFrame, the 8 pages) is in the app zone, so the imports are intra-zone. admin-sections.ts keeps its current imports (lib/section-path: app→lib allowed; the period module: app→composition today, or intra-app after P316). No cycle: admin-sections imports none of its new consumers. Out-of-zone literals are excluded because the api, composition and components-composition rules do not allow app.

**API sketch.**

```ts
const SECTIONS = { overview: section('overview', '/admin', 'Overview', { ranged: true }), health: ..., users: section('users', '/admin/users', 'Users & roles'), ... } satisfies Record<AdminSectionId, AdminSection>;
export function adminSection(id: AdminSectionId): AdminSection;
export const SCHEDULED_TASKS_ANCHOR = 'scheduled';
export function adminHref(id: AdminSectionId, opts?: { range?: RangeKey; hash?: string }): string; // applies rangeHref only when the section is ranged
export const ADMIN_NAV_GROUPS = [{ id: 'console', label: null, sections: [SECTIONS.overview] }, ...];
export const USERS_HREF = SECTIONS.users.href; // or replace its 3 uses with adminHref('users')
// AdminFrame.tsx
export function AdminPageFrame(props: { section: AdminSectionId; actions?: ReactNode; fallbackLabel: string; children: ReactNode }) // title = adminSection(id).title; RangeControl rendered iff section.ranged, with basePath = section.href
```

**Migration steps.**

1. admin-sections.ts: build a SECTIONS record keyed by AdminSectionId. Build ADMIN_NAV_GROUPS from SECTIONS.x references, keeping group order and labels. Add adminSection(id), adminHref(id, opts) and SCHEDULED_TASKS_ANCHOR. Keep rangeHref, adminSectionHref and deriveActiveAdminSection unchanged.
2. AdminFrame.tsx: replace the title and rangeBasePath props with section: AdminSectionId. Derive the title, and render RangeControl when the section's ranged flag is true.
3. Update the 8 AdminPageFrame callers (overview, health, esi, traffic, search, queue, statics, users) to pass section='…' and delete their title and rangeBasePath literals.
4. ScheduledTasks.tsx:181: use id={SCHEDULED_TASKS_ANCHOR}.
5. signals.ts: replace HEALTH_PAGE, ESI_PAGE and the inline page objects with one local PAGE_ACTIONS map whose hrefs come from adminHref ('health', 'esi', health with hash SCHEDULED_TASKS_ANCHOR, 'queue', 'statics'). Point SOURCES, deriveStatusGroups, staticsAttention, queueAttention and deriveAttention.actionFor at it, so each { label, href } pair is defined once.
6. actions-view.ts: take id, title and href from adminSection('queue' | 'users' | 'statics').
7. AccountsCard, TrafficCards (both links), EsiCards and ServiceLevelRows: use adminHref(...).
8. Fix the range drift: AudienceCard has rangeKey, so use adminHref('traffic', { range: rangeKey }) and adminHref('search', { range: rangeKey }). For TrafficLists' Referrers→Search link, thread rangeKey from traffic/page.tsx (it already has it). Optionally pass rangeKey into deriveAttention and deriveStatusGroups so health and esi actions keep the range too; treat that as a product choice and keep the signals.test expectations explicit.
9. admin-console.test.ts: switch staticsFrame() to section: 'statics' and drop rangeBasePath.

**Tests.** admin-sections.test.ts: add adminHref cases (non-ranged ignores range; ranged keeps the default range off the URL; hash appended), and assert every AdminSectionId appears exactly once across ADMIN_NAV_GROUPS. Keep the literal href expectations in signals.test.ts (10 '/admin' assertions) and actions-view.test.ts as the regression guard; they must pass unchanged, apart from any range-carrying change chosen in the drift step. admin-console.test.ts covers the AdminPageFrame gate; add one assertion that a ranged section renders the 'Reporting range' control and statics does not.

**Notes.** Preserve the '#scheduled' anchor behavior and the 'View jobs', 'Open queue' and 'Open statics' labels exactly as signals.test asserts. The overview section matches by exact path (candidate.href === '/admin'); keep that when building from SECTIONS. The preview sections (leavesConsole) stay in the table. P316 is a soft dependency: admin-sections imports parseRange and RangeKey from the period module, so landing the move first avoids touching those imports twice. The out-of-zone literals (6 api redirects, 4 command-palette entries, 2 account-menu links) would need a site-wide route table in lib; that is a separate lead, not part of this change.

<sub>Reported by: area:app-site.</sub>

<a id="p159"></a>

## P159: Route every usage-telemetry write through one after()-scheduled emitter, sharing the scheduler with domain events

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** medium · **Payoff:** high · **Size:** about −60 / +40 in production (16 inline catches, recordUsage, insertDomainEvent and the cost-metrics bodies shrink; two small modules are added), plus mechanical mock changes in about 25 test files
- **Depends on:** [P130](wave-03-src-lib-primitives-collections-math-async.md#p130), [P141](wave-09-auth-routes-and-the-mutation-transport-pipeline.md#p141)
- **Existing primitive:** `src/data/telemetry/cost-metrics.ts:emitCostMetric; src/lib/best-effort.ts:bestEffort`

**Problem.** Sixteen audit and usage writes (role changes, force-logouts, character moves, account purges, logins, merges, cross-origin hits, token-refresh failures, feedback, client telemetry) are bare promises that race the response. They are not tied to after(), so a serverless runtime can cut them off, and their error labels have drifted. data/telemetry (emitCostMetric) and data/domain-events (emitDomainEvent) each hold their own copy of the correct after()-plus-two-catches scheduler. cron-gate's recordUsage is a third copy of recordCostMetric's awaited try/catch with a different scope label.

**Verifier revision.** The core finding holds. There are 16 `void logUsageEvent({...}).catch(console.error)` call expressions in 15 files across app/api, platform/auth and composition. None is scheduled with after(), and the log labels have drifted ('[account/unlink]' in account/characters/unlink, '[auth] login telemetry', '[auth] merge telemetry', '[telemetry] failed to record usage event'). The bundled docs (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md, 'supporting after for serverless platforms') confirm that only after() hands work to waitUntil. Several of these rows are read back as data, not just logged: role_change by the admin role-audit query (data/telemetry/queries.ts:158) and auth_login by the audience queries (queries.ts:364-378), so a cut-off write loses audit and analytics data. emitCostMetric and emitDomainEvent already use the right after() shape, but as separate copies with the same two catch layers. The design changes in three ways. (1) No fallback write when after() throws. src/data/domain-events/queries.test.ts:122-136 pins the drop-and-log contract (expect(h.insert).not.toHaveBeenCalled()). There is no global vitest setup mocking next/server, so a fallback would also make tests that today only log start issuing real db inserts. All 16 sites run inside a request scope: route handlers; auth.ts getUserInfo, which already calls after() on line 164; account-merge, whose only caller (owner-transfer.ts:61) calls after() right after mergeUsers; and eve-token-service, which already calls emitDomainEvent on the same paths. (2) bestEffort and swallow are out of scope. They wrap awaited, non-telemetry side effects (map-access reprojection, purge, cron steps), and the source finding already split them into their own opportunity. (3) Put the usage emitter in a new data/telemetry/usage-events.ts rather than in log.ts. cost-metrics.test.ts mocks './log' wholesale, and a separate module keeps that mock intercepting the inner logUsageEvent call.

**Sites (22).**

- [`src/app/api/admin/role/route.ts:69-79`](../../src/app/api/admin/role/route.ts#L69-L79) — role_change; read back by the admin role-audit query (data/telemetry/queries.ts:158)
- [`src/app/api/admin/characters/reassign/route.ts:64-73`](../../src/app/api/admin/characters/reassign/route.ts#L64-L73) — admin_character_reassign
- [`src/app/api/admin/characters/unlink/route.ts:54-62`](../../src/app/api/admin/characters/unlink/route.ts#L54-L62) — admin_character_unlink
- [`src/app/api/admin/sessions/revoke/route.ts:42-51`](../../src/app/api/admin/sessions/revoke/route.ts#L42-L51) — admin_force_logout
- [`src/app/api/admin/esi-jobs/retry/route.ts:33-39`](../../src/app/api/admin/esi-jobs/retry/route.ts#L33-L39) — admin_esi_job_requeued
- [`src/app/api/account/active-character/route.ts:39-43`](../../src/app/api/account/active-character/route.ts#L39-L43) — character_switch
- [`src/app/api/account/characters/unlink/route.ts:90-94`](../../src/app/api/account/characters/unlink/route.ts#L90-L94) — character_unlink; label drift '[account/unlink]'
- [`src/app/api/account/delete/route.ts:36-39`](../../src/app/api/account/delete/route.ts#L36-L39) — account_purge scope=account
- [`src/app/api/account/purge-character/route.ts:52-55`](../../src/app/api/account/purge-character/route.ts#L52-L55) — account_purge scope=character
- [`src/app/api/feedback/route.ts:124-133`](../../src/app/api/feedback/route.ts#L124-L133) — feedback_submitted
- [`src/app/api/telemetry/route.ts:43-51`](../../src/app/api/telemetry/route.ts#L43-L51) — Lazy session lookup chained before the write; label drift '[telemetry] failed to record usage event'.
- [`src/platform/auth/same-origin.ts:49-58`](../../src/platform/auth/same-origin.ts#L49-L58) — cross_origin_mutation, reached from runMutationRoute and route guards
- [`src/platform/auth/auth.ts:164-169`](../../src/platform/auth/auth.ts#L164-L169) — auth_login. after() is already called at 164 in the same scope; label '[auth] login telemetry'.
- [`src/platform/auth/eve-token-service.ts:34-40`](../../src/platform/auth/eve-token-service.ts#L34-L40) — logTokenRefreshFailure wraps the idiom
- [`src/platform/auth/eve-token-service.ts:153-157`](../../src/platform/auth/eve-token-service.ts#L153-L157) — eve_token_refresh_race, a second copy in the same file; emitDomainEvent is already used at 142 on the same path
- [`src/composition/account-lifecycle/account-merge.ts:118-126`](../../src/composition/account-lifecycle/account-merge.ts#L118-L126) — auth_merge; label '[auth] merge telemetry'. Its only caller, owner-transfer.ts:51-61, calls after() right after.
- [`src/data/telemetry/cost-metrics.ts:17-37`](../../src/data/telemetry/cost-metrics.ts#L17-L37) — recordCostMetric (awaited, swallows) plus emitCostMetric (after(), logs scheduling failure). This is the correct shape, but it cannot carry characterId.
- [`src/data/domain-events/queries.ts:10-27`](../../src/data/domain-events/queries.ts#L10-L27) — insertDomainEvent and emitDomainEvent: the same two-layer after() pattern, written separately in another data slice
- [`src/data/domain-events/queries.test.ts:122-136`](../../src/data/domain-events/queries.test.ts#L122-L136) — Pins the contract that when after() throws, the event is logged and not inserted.
- [`src/composition/pipelines/cron-gate.ts:59-69`](../../src/composition/pipelines/cron-gate.ts#L59-L69) — recordUsage(scope, action, metadata) is recordCostMetric with a scope label. It is awaited on purpose, since crons record before responding.
- [`src/data/telemetry/log.ts:7-17`](../../src/data/telemetry/log.ts#L7-L17) — logUsageEvent is a raw insert that rejects, so every caller re-adds a catch.
- [`src/data/telemetry/queries.ts:48-53`](../../src/data/telemetry/queries.ts#L48-L53) — The read module re-exports logUsageEvent, and all 16 sites import it from here.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/lib/best-effort.ts:1-12`](../../src/lib/best-effort.ts#L1-L12) — Awaited best-effort for non-telemetry side effects (map-access-identity, maps/purge, account-merge 130-141). A different concept and message format; tracked as its own opportunity.
- [`src/transport/cron.ts:24-30`](../../src/transport/cron.ts#L24-L30) — swallow(label, promise) awaits cron side steps (refresh-prices declaration, drain-esi-refresh-jobs, esi-refresh-worker). Not telemetry.
- [`src/composition/board/net-worth-link.ts:11-22`](../../src/composition/board/net-worth-link.ts#L11-L22) — after() with an awaited inline fallback, used to revalue the roster. It deliberately runs inline outside a request scope, which is a different contract from the tested drop-on-no-scope for ledger writes.
- [`src/instrumentation.node.ts:1-8`](../../src/instrumentation.node.ts#L1-L8) — Deliberately uses the awaited recordCostMetric because it runs outside any request scope. The awaited path must remain.
- [`src/data/market-prices/refresh-on-view.ts:155-176`](../../src/data/market-prices/refresh-on-view.ts#L155-L176) — after() write-behind with an observer callback; custom body, not a telemetry write
- [`src/data/market-history/refresh-on-view.ts:94-116`](../../src/data/market-history/refresh-on-view.ts#L94-L116) — same as above

</details>

**Home.** `src/lib/after-response.ts (scheduler) plus src/data/telemetry/usage-events.ts (usage emitter)`

**Boundary check.** lib/after-response.ts is in the 'lib' zone, whose rule allows only 'config'. It imports only next/server, which is an npm package, not a zone; src/lib/service-auth.ts already imports next/server. Its consumers are data/telemetry and data/domain-events (rule 'data' allows 'lib') and app/api/telemetry (rule 'api' allows 'lib'). It has to live in lib because each src/data subfolder is its own zone and the 'data' rule allows only 'data/eve-data' across slices, so data/domain-events cannot import data/telemetry. usage-events.ts is in data/telemetry, and its consumers are app/api (rule 'api' allows 'data'), platform/auth ('platform/auth' allows 'data'), composition ('composition' allows 'data') and cost-metrics.ts in the same slice.

**API sketch.**

```ts
// src/lib/after-response.ts
/** Schedule best-effort work after the response. Logs `${label} write failed` on rejection and `${label} scheduling failed` when after() throws, in which case the task does not run. */
export function runAfterResponse(label: string, task: () => Promise<unknown>): void;

// src/data/telemetry/usage-events.ts
export interface UsageEventInput { action: UsageAction; characterId?: number | null; metadata?: Record<string, unknown> }
export function recordUsageEvent(scope: string, input: UsageEventInput): Promise<void>; // awaited, never rejects, logs `[${scope}] telemetry write failed`
export function emitUsageEvent(scope: string, input: UsageEventInput | (() => Promise<UsageEventInput>)): void; // runAfterResponse(`[${scope}] telemetry`, …)
```

**Migration steps.**

1. Add src/lib/after-response.ts with runAfterResponse and its test, src/lib/after-response.test.ts. Mock next/server's after() and cover three cases: the callback is scheduled, not run; a rejected task logs `${label} write failed`; when after() throws, it logs `${label} scheduling failed` and the task never runs.
2. Add src/data/telemetry/usage-events.ts with recordUsageEvent and emitUsageEvent. It imports logUsageEvent from './log', so cost-metrics.test's vi.mock('./log') still intercepts. emitUsageEvent resolves a lazy input inside the scheduled task. Add usage-events.test.ts.
3. Rewrite cost-metrics.ts: recordCostMetric(action, metadata) = recordUsageEvent('cost-metrics', { action, metadata }) and emitCostMetric = emitUsageEvent('cost-metrics', { action, metadata }). The log strings '[cost-metrics] telemetry write failed' and '… scheduling failed' stay the same, and cost-metrics.test.ts passes unchanged.
4. Rewrite emitDomainEvent as runAfterResponse('[domain-events] ledger', () => db.insert(domainEvents).values({...})) and delete insertDomainEvent. The strings asserted in domain-events/queries.test.ts:106-136 stay the same.
5. cron-gate.ts: delete recordUsage. workContext.record and emitRun call `await recordUsageEvent(scope, { action, metadata })`. This stays awaited, and the '[cron:test] telemetry write failed' assertion in cron-gate.test.ts:377 is preserved.
6. Replace the 16 inline sites with emitUsageEvent(scope, {...}), using the file's route path as the scope: 'admin/role', 'admin/characters/reassign', 'admin/characters/unlink', 'admin/sessions/revoke', 'admin/esi-jobs/retry', 'account/active-character', 'account/characters/unlink' (fixes the '[account/unlink]' drift), 'account/delete', 'account/purge-character', 'feedback', 'same-origin', 'auth', 'eve-token' (logTokenRefreshFailure becomes a one-liner, and 153-157 uses the same scope) and 'account-merge'. For the telemetry route, use emitUsageEvent('telemetry', async () => ({ action, characterId: await getSessionCharacterId(), metadata: safeMetadata })).
7. Update tests. Wherever a test mocks '@/data/telemetry/queries' with { logUsageEvent } to observe these writes, mock '@/data/telemetry/usage-events' with `{ emitUsageEvent: (_s, i) => logUsageEventMock(typeof i === 'function' ? undefined : i) }` or an async-resolving variant. That covers the admin/*, account/*, feedback, telemetry, same-origin, eve-token-service, account-merge and problem-matrix tests, plus the mutation-route tests that mock it only for requireSameOrigin. Move the '[same-origin] telemetry write failed' and '[eve-token] telemetry write failed' assertions (same-origin.test.ts:136, eve-token-service.test.ts:593) to usage-events.test.ts, or mock after() to run its callback.
8. Remove logUsageEvent from the re-export block in data/telemetry/queries.ts:48-53; fallow unused-exports will flag it once no caller imports it there. Keep the pruneUsageLogs and claim/complete re-exports, which housekeeping.ts and public-budget-alert.ts still use.
9. Run test-runner `pnpm check`. Fallow coverage-gaps requires the two new files to be reached by tests.

**Tests.** New: src/lib/after-response.test.ts (schedules; task rejection logs the label; after() throw logs and skips the task) and src/data/telemetry/usage-events.test.ts (record swallows and logs '[scope] telemetry write failed'; emit schedules through after(); lazy input is resolved inside the callback; characterId is passed through). Existing guards that must keep passing unchanged: src/data/telemetry/cost-metrics.test.ts, src/data/domain-events/queries.test.ts (including the 'scheduling fails, no insert' case at 122-136), src/composition/pipelines/cron-gate.test.ts:377, and src/data/telemetry/capability.test.ts. Existing tests to re-point: the route tests listed under admin/*, account/{active-character,characters/unlink,delete,purge-character}, feedback, telemetry; src/platform/auth/same-origin.test.ts, eve-token-service.test.ts and eve-token-service.revoke.test.ts; src/composition/account-lifecycle/account-merge.test.ts; src/app/api/problem-matrix.test.ts; and the mutation-route tests that mock queries.logUsageEvent only for the same-origin path.

**Notes.** Behavior changes the migration must account for. (1) Timing: the inline sites write while the response is still being sent, and after migration they write after it. Any test that asserts logUsageEvent right after POST must mock emitUsageEvent or flush the after() callback, as cost-metrics.test.ts:26-37 already does. (2) No scope: when after() throws, the new path drops the write and logs it, the existing tested contract for emitDomainEvent and emitCostMetric. The inline sites currently attempt the write in that case, but none of them runs outside a request scope (see reason), so nothing is lost in practice. Do not add the proposal's direct-write fallback. (3) Telemetry route: the session read moves inside after(). The bundled after.md allows cookies() and headers() inside after() in Route Handlers, and getFullSession's own after() call is fine because 'after can be nested inside other after calls'. (4) Label drift is resolved by deriving every label from the scope argument. The correct copies are the ones that use the route path ('[admin/role] telemetry write failed' and similar). (5) Keep recordCostMetric and recordUsageEvent as awaited paths, because instrumentation.node.ts and cron-gate both depend on awaited writes. (6) eve-token-service is also reached from owner-sync inside after() callbacks, where it already calls emitDomainEvent, so the usage writes share the same scope exposure.

<sub>Reported by: area:app-api, area:composition, area:data-services, area:lib-infra, area:platform, concern:request-pipeline.</sub>

← [Wave 9: Auth, routes and the mutation/transport pipeline](wave-09-auth-routes-and-the-mutation-transport-pipeline.md) · [Index](README.md#roadmap) · [Wave 11: ESI reads, owner-sync and owner-dataset persistence](wave-11-esi-reads-owner-sync-and-owner-dataset.md) →
