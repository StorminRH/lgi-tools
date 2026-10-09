# Wave 12: Market data, search and client data reads

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

← [Wave 11: ESI reads, owner-sync and owner-dataset persistence](wave-11-esi-reads-owner-sync-and-owner-dataset.md) · [Index](README.md#roadmap) · [Wave 13: Industry planner and wormhole-sites verticals](wave-13-industry-planner-and-wormhole-sites-verticals.md) →

Market reads first: parallel on-view reads, then useEffectEvent hooks, then lib/write-behind with the shared runner, then batched Fuzzwork fallback, then the PriceFigures types. Then consolidate the names clients. Next the client resource (L, medium) and useSlotsLive on useLiveDataset. Search follows: lazy sources load only their search function, every source goes through rankFuzzyResults, and registries become static arrays. Last, the search answer hook and the map access editor/dialog hooks.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☐ | [P181](#p181) | Run independent reads concurrently in getLivePrices, getLiveHistory and getAvailableCorpStructuresForUser; keep the price write-behind | server-pipeline | S | low | low | — |
| ☐ | [P052](#p052) | Replace the latest-value refs in both refresh-on-view hooks with useEffectEvent, and drop the history hook's unused return state | react-hook | S | low | low | — |
| ☐ | [P077](#p077) | Use useEffectEvent in the on-view refresh hooks, drop the history hook's dead state, and share notifyWriteBehind through lib | client-data | S | low | low | [P052](#p052) |
| ☐ | [P332](#p332) | Share the market write-behind runner and the Forge region id, and overlap the independent on-view reads | simplification | S | low | low | [P247](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p247), [P077](#p077) |
| ☐ | [P295](#p295) | Batch the Fuzzwork fallback in the on-view price refresh instead of one request per type | efficiency | S | low | medium | [P335](wave-01-quick-wins-delete-dead-code-fix-small.md#p335), [P332](#p332) |
| ☐ | [P076](#p076) | Name the plain price-figure type in data/market-prices and build RefreshedPrice, PriceLite and the planner rows from it | contracts-validation | S | low | low | [P304](wave-01-quick-wins-delete-dead-code-fix-small.md#p304) |
| ☐ | [P075](#p075) | Put both name clients and both hooks in data/eve-data, with one normalize and an explicit label | client-data | S | low | low | — |
| ☐ | [P063](#p063) | Add a store-backed client resource (memoise until rejected, one shared retry, store-published value) and one apiFetch failure label; rebuild the five singleton index/asset loaders and their hooks on it | client-data | L | medium | medium | [P010](wave-08-charts-images-and-board-workspace-adoption.md#p010), [P075](#p075) |
| ☐ | [P065](#p065) | Rebuild useSlotsLive on useLiveDataset with skill-eligible coldness, promote readWithRetries and the latest-wins read to src/lib, and add useRememberedResource for the three remembered per-identity reads | client-data | M | medium | medium | [P140](wave-03-src-lib-primitives-collections-math-async.md#p140), [P068](wave-09-auth-routes-and-the-mutation-transport-pipeline.md#p068), [P154](wave-01-quick-wins-delete-dead-code-fix-small.md#p154) |
| ☐ | [P328](#p328) | Make lazy search sources load only their search function | simplification | S | low | low | — |
| ☐ | [P069](#p069) | Send every search source through rankFuzzyResults (with a tie-break), declare lazy-source metadata once, and share the all-words name match | client-data | M | low | medium | [P328](#p328) |
| ☐ | [P276](#p276) | Replace the page-settings and search side-effect registries with static arrays passed explicitly | feature-skeleton | M | low | medium | [P123](wave-07-ui-kit-primitives-src-components-ui.md#p123), [P328](#p328), [P069](#p069) |
| ☐ | [P048](#p048) | Route GlobalSearch and CharacterSearchControl through the platform/search debounced search hook | react-hook | M | low | medium | [P039](wave-07-ui-kit-primitives-src-components-ui.md#p039) |
| ☐ | [P054](#p054) | Share the server-seeded draft and map-access write steps between the map access editors, and drop the characterSearch slot | react-hook | S | low | low | [P056](wave-07-ui-kit-primitives-src-components-ui.md#p056), [P048](#p048) |
| ☐ | [P270](#p270) | Extract useAuthorityScopedMapDialogs and an EditingMapAccessDialog host for MapSwitcher and MapCatalogue | feature-skeleton | S | low | low | [P054](#p054) |

<a id="p181"></a>

## P181: Run independent reads concurrently in getLivePrices, getLiveHistory and getAvailableCorpStructuresForUser; keep the price write-behind

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -20 / +8
- **Depends on:** —
- **Existing primitive:** `src/composition/sync/corp-structures-sync.ts:getCorpStructuresPageData (pattern)`

**Problem.** Three server read paths await independent queries one after another. getLivePrices awaits a Neon seed read before starting the live fetch. getLiveHistory reads stored history only after the meta read and the ESI fetch, although it depends on neither. getAvailableCorpStructuresForUser goes through getCorpStructuresForUserOnView, which also reads sync freshness the caller discards, then reads rigs in a second round trip. It also copies the withCompletion merge that getCorpStructuresPageData already uses. Each path costs one extra DB round trip per request. Payoff is small but the fix is risk-free.

**Verifier revision.** Two of the three parts hold up. In getLivePrices, the seed read (getPrices) and the live fetch are independent, and the same sequential pattern appears in getLiveHistory, which the finders missed. getAvailableCorpStructuresForUser runs two sequential round trips, makes an unneeded freshness query, and rebuilds withCompletion by hand. The third part, writing behind only when !cacheHit, is rejected. cacheHit is computed from a per-process Set (cache-resolution.ts). It means 'this request did not resolve the entry in this process', not 'this value is already persisted'. Under LIVE_CACHE_LIFE (stale 30, revalidate 30, expire 60), a background stale-while-revalidate refresh marks its resolution id only on the instance that ran it. A reader on any other instance sees cacheHit=true, so under the proposal the refreshed price would never reach Neon. Other features read prices from Neon (getPrices in industry-planner getBlueprintPricing), so this would make their prices staler. A failed after() write would also never be retried by a later cache hit. The harm the proposal cites is small: updatedAt and staleAfter move forward on values up to 60s old, against a 24h market_prices TTL (freshness.test.ts: 86_400_000).

**Sites (7).**

- [`src/data/market-prices/refresh-on-view.ts:111-128`](../../src/data/market-prices/refresh-on-view.ts#L111-L128) — `const seed = await getPrices(ids)` runs before mapBounded live fetches; seed is consulted only at 150-151
- [`src/data/market-history/refresh-on-view.ts:65-80`](../../src/data/market-history/refresh-on-view.ts#L65-L80) — meta read, then fetchHistoryFromSource(staleIds), then getStoredHistory(ids); the stored read depends on neither (missed by finders)
- [`src/composition/sync/corp-structures-sync.ts:94-113`](../../src/composition/sync/corp-structures-sync.ts#L94-L113) — available view awaits getCorpStructuresForUserOnView, then getCorpStructureRigs sequentially; loop at 97-111 re-implements withCompletion
- [`src/composition/sync/corp-structures-sync.ts:66-82`](../../src/composition/sync/corp-structures-sync.ts#L66-L82) — getCorpStructuresForUserOnView also runs loadFreshness, whose lastRefreshedAt the available view throws away
- [`src/composition/sync/corp-structures-sync.ts:115-121`](../../src/composition/sync/corp-structures-sync.ts#L115-L121) — withCompletion already produces {...row, rigTypeIds, taxPct}
- [`src/composition/sync/corp-structures-sync.ts:129-153`](../../src/composition/sync/corp-structures-sync.ts#L129-L153) — sibling getCorpStructuresPageData reads structures, freshness, rigs and names in one Promise.all
- [`src/features/owned-structures/types.ts:5-16`](../../src/features/owned-structures/types.ts#L5-L16) — CorpStructurePageStructure = CorpStructureRow + rigTypeIds + taxPct, structurally identical to AvailableCorpStructure (corp-structures-sync.ts 84-92)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/market-prices/refresh-on-view.ts:137-176`](../../src/data/market-prices/refresh-on-view.ts#L137-L176) — Writing behind only when !cacheHit is rejected: cacheHit comes from a process-local Set, so values refreshed by a background stale-while-revalidate on another instance would never be persisted
- [`src/data/market-prices/cache-resolution.ts:1-13`](../../src/data/market-prices/cache-resolution.ts#L1-L13) — freshResolutionIds is per-process memory, so cacheHit cannot stand for 'already in Neon'
- [`src/data/market-prices/ingest.ts:85-126`](../../src/data/market-prices/ingest.ts#L85-L126) — The upsert moves updated_at and stale_after forward. With a 24h TTL, a value up to 60s old makes no practical difference.

</details>

**Home.** `In place; no new primitive. Use the Promise.all pattern of getCorpStructuresPageData and the existing withCompletion helper in src/composition/sync/corp-structures-sync.ts.`

**Boundary check.** No new cross-zone imports. composition/sync/corp-structures-sync.ts already imports CorpStructurePageStructure from features/owned-structures/types; the composition rule allows features. data/market-prices and data/market-history only reorder calls to their own modules.

**API sketch.**

```ts
export async function getAvailableCorpStructuresForUser(userId: string): Promise<CorpStructurePageStructure[]> // delete interface AvailableCorpStructure (structurally identical)
```

**Migration steps.**

1. refresh-on-view.ts (market-prices): replace lines 111-128 with `const [seed, live] = await Promise.all([getPrices(ids), mapBounded(ids, PER_TYPE_CONCURRENCY, async (id) => { ... unchanged worker ... })]);`. Keep `freshRaws.push(raw)` unconditional.
2. market-history/refresh-on-view.ts: replace line 65 and line 80 with `const [meta, stored] = await Promise.all([getHistoryMeta(ids), getStoredHistory(ids)]);` and leave staleIds and the fetch as they are.
3. corp-structures-sync.ts: rewrite getAvailableCorpStructuresForUser: `const { corporations } = await loadCorpViewer(userId); const ids = corporations.map(c => c.corporationId); const [structuresByCorp, rigsByStructure] = await Promise.all([getCorpStructures(ids), getCorpStructureRigs(ids)]); scheduleCorpStructuresRefresh(userId); return corporations.flatMap(({ corporationId, grant }) => visibleStructures(grant.structures, structuresByCorp.get(corporationId)).map(s => withCompletion(s, rigsByStructure)));`
4. Delete the AvailableCorpStructure interface (lines 84-92) and the hand-written loop. Keep the connection() call via loadCorpViewer, and schedule the refresh even when the viewer has no corporations, as today.

**Tests.** Existing tests keep guarding the behavior: src/data/market-prices/refresh-on-view.test.ts (seed fallback, write-behind of freshly fetched rows, dedupe, empty input), src/data/market-history/refresh-on-view.test.ts (warm/stale/missing classification), and src/composition/sync/corp-structures-sync.test.ts 'offers the planner the structures of shared corps and of corps the viewer manages' (expected output unchanged). Add to corp-structures-sync.test.ts: getAvailableCorpStructuresForUser does not call listCorpStructureSyncStates, and does schedule the refresh. Add a refresh-on-view test showing the live fetch starts before getPrices resolves (getPricesMock returns a deferred promise; assert fetchPricesFromSourceMock was called before resolving it).

**Notes.** Behavior to preserve: (1) A rejected getPrices still rejects getLivePrices; with Promise.all the live fetches still run and fill the remote cache. Making the seed best-effort (`.catch(() => new Map())`) would change behavior, so propose it separately if wanted. (2) The available view currently returns structures only for corps whose grant is not 'none' (visibleStructures). Rigs are read for every corp, which is harmless and unchanged. (3) The available view must keep scheduling scheduleCorpStructuresRefresh even with zero corporations, as getCorpStructuresForUserOnView does today; getCorpStructuresPageData returns early and skips it. Leads outside this verdict: bounded worker pools are hand-written four times (market-prices/refresh-on-view.ts 73-89 mapBounded, market-prices/source.ts ~66-89, market-history/source.ts 49-63 runConcurrent, eve-data/entity-names.ts 25-44), a candidate for one src/lib helper. Also, markFreshPriceResolution adds an id on background revalidations that may never be consumed on that instance, a slow leak in freshResolutionIds.

<sub>Reported by: concern:efficiency.</sub>

<a id="p052"></a>

## P052: Replace the latest-value refs in both refresh-on-view hooks with useEffectEvent, and drop the history hook's unused return state

- **Status:** [ ] not started
- **Category:** react-hook · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -20 / +6 production lines; test churn about 15 lines
- **Depends on:** —
- **Existing primitive:** `react:useEffectEvent; src/lib/array.ts:dedupe`

**Problem.** data/market-history/use-refresh-on-view and data/market-prices/use-refresh-on-view both mirror typeIds and their callback into refs through an effect that runs after every render, and both dedupe with an inline [...new Set()] instead of lib/array.dedupe. The history hook also keeps `inputs` and `refreshing` state that its only consumer, PricingProvider.useMarketRefresh, ignores. The setRefreshing(true) at the start of each refresh is therefore a wasted re-render of the planner's pricing provider, and the `inputs` Map is retained for nothing.

**Verifier revision.** The core simplification is real. Both data-slice hooks copy typeIds and their callback into refs through a dependency-free effect, then read them in an AbortController task keyed on `enabled`. Since React 19.2.8, useEffectEvent replaces this. The repo already uses it, and eslint-plugin-react-hooks 7.1.1 accepts effect-event calls anywhere lexically inside a useEffect(...) call, including async continuations (AtlasReturnRefresh already passes one into a listener this way). Three parts of the proposal fail. (1) usePriceClock cannot convert mirrorsRef: `assemble` is passed down to useMarketRefresh (PricingProvider 539), wrapped in onBatch, called from inside useRefreshOnView, and listed in effect deps. The lint rule rejects effect-event references outside a useEffect call. pricingRef alone could convert, but the ref-copy effect would stay, so the change is not worth it. (2) The efficiency claim is wrong. setInputs, the onResult-driven setMarketHistory and setRefreshing(false) run in one continuation and React batches them into one render. The only avoidable render is setRefreshing(true) at refresh start. (3) PricingProvider, the only production consumer, discards useRefreshHistoryOnView's entire return value, `refreshing` included. So both state fields can go, not just `inputs`. No shared engine is proposed, which is correct: data/market-history may not import data/market-prices. Payoff is low.

**Sites (8).**

- [`src/data/market-history/use-refresh-on-view.ts:8-63`](../../src/data/market-history/use-refresh-on-view.ts#L8-L63) — HistoryOnViewResult (8-11), inputs/refreshing state (20-21), ref-copy effect (23-28), inline Set dedupe (34), setInputs + onResultRef call (49-52), return (62)
- [`src/data/market-prices/use-refresh-on-view.ts:58-139`](../../src/data/market-prices/use-refresh-on-view.ts#L58-L139) — ref-copy effect (74-79), inline Set dedupe (85), onBatchRef call inside publish (92-96); comment 63-66 says typeIds are read once per run on purpose
- [`src/features/industry-planner/components/PricingProvider.tsx:384-410`](../../src/features/industry-planner/components/PricingProvider.tsx#L384-L410) — useMarketRefresh: only consumer of useRefreshHistoryOnView; return value discarded (407-410); uses only `refreshing` from useRefreshOnView (391)
- [`src/data/market-history/use-refresh-on-view.test.ts:10-21, 41-44, 48-106`](../../src/data/market-history/use-refresh-on-view.test.ts#L10-L21) — mocks react without spreading the original (no useEffectEvent); asserts setInputs and return shape
- [`src/data/market-prices/use-refresh-on-view.test.ts:8-19`](../../src/data/market-prices/use-refresh-on-view.test.ts#L8-L19) — react mock also lacks useEffectEvent
- [`src/lib/array.ts:1-3`](../../src/lib/array.ts#L1-L3) — dedupe<T>(items: T[]) already exists
- [`src/app/(site)/atlas/AtlasReturnRefresh.tsx:10-16`](../../src/app/%28site%29/atlas/AtlasReturnRefresh.tsx#L10-L16) — existing useEffectEvent, invoked asynchronously from a listener set up inside the effect
- [`src/mapper/tracking/JumpDoorbellObserver.tsx:28-41`](../../src/mapper/tracking/JumpDoorbellObserver.tsx#L28-L41) — existing useEffectEvent usage

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/components/PricingProvider.tsx:303-360, 539`](../../src/features/industry-planner/components/PricingProvider.tsx#L303-L360) — usePriceClock mirrorsRef/pricingRef: `assemble` reads mirrorsRef and is passed down to useMarketRefresh and onBatch, and sits in effect deps. A useEffectEvent there violates react-hooks 7.1.1 ('can only be called from Effects … cannot be passed down'). Converting pricingRef alone leaves the ref-copy effect in place.
- [`src/components/PreferencesProvider.tsx:57-60, 95-104`](../../src/components/PreferencesProvider.tsx#L57-L60) — userIdRef is read from `set`, an event callback published through context, not from an effect, so useEffectEvent does not apply
- [`src/mapper/fog/FogLayer.tsx:108-139`](../../src/mapper/fog/FogLayer.tsx#L108-L139) — tickRef is invoked from requestAnimationFrame scheduled outside effects; not an effect-event case

</details>

**Home.** `In place: src/data/market-history/use-refresh-on-view.ts and src/data/market-prices/use-refresh-on-view.ts (no new primitive). Reuse react:useEffectEvent and src/lib/array.ts:dedupe.`

**Boundary check.** No new module. Both hooks are in data slices ({from:'data', allow:[..., 'transport', 'lib', ...]}), so importing dedupe from '@/lib/array' is legal; market-prices already imports chunk from it. A shared hook would have to live in src/lib, but none is needed for a five-line idiom.

**API sketch.**

```ts
export function useRefreshHistoryOnView(typeIds: number[], opts: { enabled: boolean; onResult: (inputs: Map<number, MarketHistoryInputs>) => void }): void;
// inside: const readIds = useEffectEvent(() => dedupe(typeIds)); const emit = useEffectEvent((m: Map<number, MarketHistoryInputs>) => opts.onResult(m));
export function useRefreshOnView(typeIds: number[], opts: { enabled: boolean; onBatch?: (prices: Map<number, RefreshedPrice>) => void; refreshKey?: string }): RefreshOnViewResult; // unchanged signature; refs replaced by readIds/emitBatch effect events
```

**Migration steps.**

1. Ask docs-researcher to confirm React 19.2 useEffectEvent semantics for calls from async continuations started inside the effect. The rule implementation (eslint-plugin-react-hooks 7.1.1 Identifier visitor with lastEffect) already allows them lexically.
2. market-prices hook: delete typeIdsRef, onBatchRef and the ref-copy effect (74-79). Add `const readIds = useEffectEvent(() => dedupe(typeIds))` and `const emitBatch = useEffectEvent((m) => opts.onBatch?.(m))`. Use readIds() at line 85 and emitBatch(snapshot) inside publish. Keep deps [enabled, refreshKey] and the read-once comment, which is still true.
3. market-history hook: likewise replace the refs (23-28) with readIds/emit effect events and use dedupe. Delete the inputs and refreshing state, the setInputs/setRefreshing calls and the try/finally that existed only for refreshing. Make onResult required, return void and delete the HistoryOnViewResult interface (otherwise Fallow flags an unused type).
4. PricingProvider.useMarketRefresh needs no code change: it already ignores the return value.
5. Update both hook tests' vi.mock('react') factories to add `useEffectEvent: (fn) => fn`. Rewrite the history test assertions from setInputs and the return shape to onResult calls, and drop the setRefreshing expectations. Update the src/features/industry-planner/components/PricingProvider.test.ts line 21 mock to return undefined.

**Tests.** src/data/market-history/use-refresh-on-view.test.ts: keep dedupe ([34,34,35] posts [34,35]); disabled or empty ids make no fetch; ok publishes via onResult; ok:false and thrown results leave onResult uncalled; unmount aborts and suppresses onResult. src/data/market-prices/use-refresh-on-view.test.ts: existing batching, abort and freshness cases stay as they are, with only the mock extended. PricingProvider.test.ts guards the consumer wiring.

**Notes.** Semantics preserved. useEffectEvent's latest-closure update happens during commit, before passive effects. The read at effect start therefore sees the same current typeIds the ref-copy effect gave (that effect was declared first). The market-prices contract that typeIds changes must not refire a refresh (comment 63-66) still holds, because the effect events are not deps. Corrections to the original claim: dropping `inputs` saves no render, since React 18+ batches its update with setMarketHistory and setRefreshing(false). Dropping the history hook's `refreshing` removes one real but unobservable PricingProvider render per refresh start. useRefreshOnView's own `prices` state is also unused by PricingProvider but is used by ScannerLivePrices and SiteResourcesLive, so keep it.

<sub>Reported by: area:data-services, concern:client-hooks.</sub>

<a id="p077"></a>

## P077: Use useEffectEvent in the on-view refresh hooks, drop the history hook's dead state, and share notifyWriteBehind through lib

- **Status:** [ ] not started
- **Category:** client-data · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -35 / +15 (two latest-ref blocks, two state slots, one duplicated wrapper and two result interfaces removed; one lib helper added)
- **Depends on:** [P052](#p052)
- **Existing primitive:** `src/lib/client-store.ts (lib already hosts hooks such as use-stable-value)`

**Problem.** useRefreshOnView and useRefreshHistoryOnView each hand-roll a latest-value ref (refs plus a dependency-free useEffect) to read typeIds and the callback once per run without re-firing. React 19.2's useEffectEvent covers this and is already used in the repo. useRefreshHistoryOnView also stores `inputs` and `refreshing` state that no production caller reads: PricingProvider ignores the return value and keeps its own merged map through onResult. Server side, market-history and market-prices each define the same try/catch observer wrapper, notifyWriteBehind, and nearly the same WriteBehindResult type, because data sub-zones may not import each other.

**Verifier revision.** The proposed src/lib useOnViewRun hook is rejected. What the two hooks actually share is about ten lines (latest-ref, the enabled guard, AbortController, a refreshing flag). The prices hook's logic dominates: a module cache, staleness filtering, batching, a per-batch pending set, per-batch publish and an 'aborted' sentinel. Wrapping the churn-hotspot hook in a generic runner adds indirection for little saving. The claimed drift is not a bug. The history hook's only consumer (PricingProvider.tsx:407) always passes one typeId, against a cap of 50, never needs refreshKey, and handles the aborted case in its finally block. Three smaller parts are real. (1) Both hooks hand-roll the latest-value ref pattern, though React 19.2.8's useEffectEvent covers it and the repo already uses it (AtlasReturnRefresh, JumpDoorbellObserver). (2) useRefreshHistoryOnView keeps `inputs` and `refreshing` state that its only production consumer ignores; PricingProvider merges results into its own marketHistory state through onResult. The extra setState calls only cause re-renders of the planner provider. (3) notifyWriteBehind is copied in both server modules with structurally different result types ('partial' exists only for history). Data sub-zones cannot import each other or data/telemetry, so a small lib helper is the legal home.

**Sites (8).**

- [`src/data/market-history/use-refresh-on-view.ts:8-63`](../../src/data/market-history/use-refresh-on-view.ts#L8-L63) — Latest-ref (23-28); unused inputs/refreshing state (20-21, 49-55); single fetch with no batching
- [`src/data/market-prices/use-refresh-on-view.ts:74-79, 83-134`](../../src/data/market-prices/use-refresh-on-view.ts#L74-L79) — Same latest-ref pattern; run effect with batching, pending set and module cache
- [`src/features/industry-planner/components/PricingProvider.tsx:391-410`](../../src/features/industry-planner/components/PricingProvider.tsx#L391-L410) — The only history consumer passes [structure.product.typeId], ignores the return and merges through onResult into its own state
- [`src/data/market-history/refresh-on-view.ts:26-42, 94-115`](../../src/data/market-history/refresh-on-view.ts#L26-L42) — HistoryWriteBehindResult (with 'partial') and notifyWriteBehind; per-type persist loop
- [`src/data/market-prices/refresh-on-view.ts:35-51, 155-176`](../../src/data/market-prices/refresh-on-view.ts#L35-L51) — PriceWriteBehindResult (no 'partial') and an identical notifyWriteBehind; bulk persist
- [`src/app/(site)/atlas/AtlasReturnRefresh.tsx:3, 10-16`](../../src/app/%28site%29/atlas/AtlasReturnRefresh.tsx#L3) — Existing useEffectEvent usage (React 19.2.8 per package.json)
- [`src/mapper/tracking/JumpDoorbellObserver.tsx:3, 28`](../../src/mapper/tracking/JumpDoorbellObserver.tsx#L3) — Second existing useEffectEvent usage
- [`src/data/market-history/use-refresh-on-view.test.ts:1-48`](../../src/data/market-history/use-refresh-on-view.test.ts#L1-L48) — Mocks react useState/useRef/useEffect and asserts the {inputs, refreshing} return. It must change with the hook.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/market-prices/use-refresh-on-view.ts:32-56, 98-130`](../../src/data/market-prices/use-refresh-on-view.ts#L32-L56) — The module-level refreshed cache, freshPrices staleness filter, chunked batches, pending set and 'aborted' sentinel are prices-only semantics. They stay in the prices hook and must not move to a generic runner.
- [`src/app/api/market-refresh-route.ts:16-39`](../../src/app/api/market-refresh-route.ts#L16-L39) — Already the shared route plumbing for both refresh endpoints. Nothing to add there.
- [`src/data/telemetry/cost-metrics.ts:40-50`](../../src/data/telemetry/cost-metrics.ts#L40-L50) — observeCostPromise is a similar timed-outcome helper, but data/market-* may not import data/telemetry (from:data allows only data/eve-data among data sub-zones). That is why the observer injection exists.

</details>

**Home.** `react useEffectEvent (existing primitive) in both hooks; new src/lib/notify-observer.ts for the server-side observer wrapper and shared WriteBehindResult type`

**Boundary check.** useEffectEvent comes from react, which has no zone. src/lib/notify-observer.ts sits in the lib zone and imports nothing, satisfying from:lib allow[config]. Its consumers are data/market-history and data/market-prices (data zone), allowed by from:data allow[lib]. The routes in app/api that pass the observer already import data under from:api allow[data].

**API sketch.**

```ts
// src/lib/notify-observer.ts
export interface WriteBehindResult { outcome: 'succeeded' | 'partial' | 'failed'; attempted: number; written: number; durationMs: number }
export function notifyObserver<T>(observer: ((result: T) => void) | undefined, result: T, label: string): void; // try { observer?.(result) } catch (err) { console.error(`[${label}] observer failed`, err) }
// hooks
const readTypeIds = useEffectEvent(() => typeIds);
const publishBatch = useEffectEvent((m: Map<number, RefreshedPrice>) => opts.onBatch?.(m));
export function useRefreshHistoryOnView(typeIds: number[], opts: { enabled: boolean; onResult?: (inputs: Map<number, MarketHistoryInputs>) => void }): void;
```

**Migration steps.**

1. History hook first (one consumer). Replace typeIdsRef, onResultRef and their syncing effect with useEffectEvent readers. Delete the `inputs` and `refreshing` state and the HistoryOnViewResult type, and return void. PricingProvider.tsx:407 already ignores the return.
2. Prices hook: replace typeIdsRef and onBatchRef (74-79) with useEffectEvent. Call readTypeIds() at the top of the run effect and publishBatch(snapshot) inside publish(). Keep deps [enabled, refreshKey] and the read-once-per-run semantics documented at 63-67. Touch nothing else.
3. Add src/lib/notify-observer.ts with notifyObserver<T> and WriteBehindResult. In both refresh-on-view.ts files, delete the local notifyWriteBehind and the PriceWriteBehindResult/HistoryWriteBehindResult interfaces, or alias them to WriteBehindResult if the routes or tests import them, and call notifyObserver(onWriteBehind, …, 'market-prices/refresh-on-view' | 'market-history/refresh-on-view').
4. Update the react mocks in both hook tests to include `useEffectEvent: (fn) => fn`, and rewrite the history test's mounted() helper, which indexes h.setters for the now-deleted state.

**Tests.** data/market-history/use-refresh-on-view.test.ts: keep the dedupe, onResult and abort-on-unmount assertions; drop the return-value and setter-index assertions; add useEffectEvent to the react mock. data/market-prices/use-refresh-on-view.test.ts: the existing batching, pending and fresh-cache tests guard the prices behaviour and only need `useEffectEvent: (fn) => fn` in the react mock. New src/lib/notify-observer.test.ts: a throwing observer is caught and logged with the label, an undefined observer is a no-op, and the result passes through. The existing refresh-on-view.test.ts in both modules covers the observer outcomes ('partial' for history; 'succeeded'/'failed' for prices). PricingProvider.test.ts mocks useRefreshHistoryOnView and needs no change.

**Notes.** Preserve the prices hook's read-once-per-run contract for typeIds (the planner's list changes on every edit). useEffectEvent keeps it, because the effect still depends only on [enabled, refreshKey]. Effect events may be called from async continuations started inside the effect, as with the docs' setInterval example. Guard publishBatch with the existing `!controller.signal.aborted` check. Prices never report 'partial'; the shared WriteBehindResult union just allows it. The admin WriteBehindOutcome (src/data/telemetry/queries.ts:505-509) types outcome as string, so the reader side is unaffected. No functional drift bug exists: the history hook's lack of batching and refreshKey is correct for its single one-id caller. If a multi-id caller is ever added, it needs chunk(…, ON_DEMAND_HISTORY_MAX_TYPE_IDS). If P076 lands first, rebase the prices-hook edit onto its RefreshedPrice change; the two touch different lines of the same file.

<sub>Reported by: dupes-triage-2.</sub>

<a id="p332"></a>

## P332: Share the market write-behind runner and the Forge region id, and overlap the independent on-view reads

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -50 production lines (two result types and notifiers -32, prices after() block -15, private retentionCutoff -4, region constant -2), about +35 in lib, and about +70 test lines. The optional int4 sweep removes about 5 more constants.
- **Depends on:** [P247](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p247), [P077](#p077)
- **Existing primitive:** `src/lib/array.ts:dedupe; src/lib/best-effort.ts:bestEffort`

**Problem.** market-prices and market-history each define a WriteBehindResult type and a notifyWriteBehind that swallows observer errors. Each also wraps persistence in a hand-rolled after() block that times, persists, derives an outcome and notifies. The outcome unions have drifted: history has 'partial' and prices does not. Both feed the same telemetry (market_*_write_behind), the same admin WriteBehindOutcome view, and the same marketRefreshRoute shell. Neither slice tests its 'failed' path, and history does not test 'partial'. The Forge region id is ESI_REGION_ID_FORGE in prices and THE_FORGE_REGION_ID in history, and the slices cannot import each other. getLivePrices awaits the Neon seed read before starting the ESI fan-out. getLiveHistory awaits meta, then ESI, then getStoredHistory(ids), although the stored read depends only on ids. market-history/ingest.ts keeps a private retentionCutoff instead of using @/lib/batched-delete's.

**Verifier revision.** The core holds. Both market on-view modules have the same write-behind result type, the same observer notifier and the same timed after() wrapper, differing only in the log prefix and a drifted outcome union. The Forge region id is defined twice under two names. Seed/meta/stored reads are awaited serially even though they are independent. Several parts are rejected or rescoped. Per-type persist batching is dropped: it runs in after() off the response path, a typical request has one type, and batching would destroy per-type partial and failed isolation. The Set-to-dedupe swap is dropped as cosmetic: the route already dedupes and the repo has 33 such inline sites. typeIdBatchSchema(max) is replaced by the cross-cutting int4 id schema, which has six copies, not two. One missed site is added: market-history/ingest.ts shadows lib retentionCutoff.

**Sites (19).**

- [`src/data/market-prices/refresh-on-view.ts:35-51`](../../src/data/market-prices/refresh-on-view.ts#L35-L51) — PriceWriteBehindResult (succeeded\|failed) and notifyWriteBehind with the '[market-prices/refresh-on-view]' prefix.
- [`src/data/market-prices/refresh-on-view.ts:155-176`](../../src/data/market-prices/refresh-on-view.ts#L155-L176) — after(): timer, one persistPrices batch, notify on success or failure, error log.
- [`src/data/market-history/refresh-on-view.ts:26-42`](../../src/data/market-history/refresh-on-view.ts#L26-L42) — HistoryWriteBehindResult (succeeded\|partial\|failed) and an otherwise identical notifyWriteBehind.
- [`src/data/market-history/refresh-on-view.ts:94-116`](../../src/data/market-history/refresh-on-view.ts#L94-L116) — after(): timer, per-type persist loop with a per-type error log and revalidateTag(historyTag), outcome derived from the succeeded count.
- [`src/data/market-prices/refresh-on-view.ts:111-128`](../../src/data/market-prices/refresh-on-view.ts#L111-L128) — await getPrices(ids) completes before mapBounded starts the ESI fan-out; the two are independent.
- [`src/data/market-history/refresh-on-view.ts:65-80`](../../src/data/market-history/refresh-on-view.ts#L65-L80) — getHistoryMeta, then fetchHistoryFromSource, then getStoredHistory(ids). The stored read depends only on ids.
- [`src/data/market-prices/constants.ts:1`](../../src/data/market-prices/constants.ts#L1) — ESI_REGION_ID_FORGE = 10000002, used in market-prices/source.ts:4,170,174.
- [`src/data/market-history/constants.ts:1`](../../src/data/market-history/constants.ts#L1) — THE_FORGE_REGION_ID = 10000002, used in market-history/source.ts:11,47.
- [`src/data/market-history/ingest.ts:11, 17-20`](../../src/data/market-history/ingest.ts#L11) — Private retentionCutoff(now) returning YYYY-MM-DD, which shadows lib retentionCutoff (src/lib/batched-delete.ts:13-15) plus formatIsoDay (src/lib/format/time.ts:29-31).
- [`src/data/market-prices/api-contract.ts:6-13`](../../src/data/market-prices/api-contract.ts#L6-L13) — Private PG_INT4_MAX and the typeIds array schema.
- [`src/data/market-history/api-contract.ts:6-13`](../../src/data/market-history/api-contract.ts#L6-L13) — Identical copy, differing only in the max constant.
- [`src/features/custom-structures/api-contract.ts:11, 18`](../../src/features/custom-structures/api-contract.ts#L11) — Third PG_INT4_MAX copy, with typeId = z.number().int().positive().max(PG_INT4_MAX).
- [`src/features/industry-planner/api-contract.ts:23, 44-45, 80, 103, 132, 165`](../../src/features/industry-planner/api-contract.ts#L23) — Fourth copy, used six times.
- [`src/features/owned-structures/api-contract.ts:37-42`](../../src/features/owned-structures/api-contract.ts#L37-L42) — Fifth copy.
- [`src/features/wormhole-sites/api-contract.ts:102-109`](../../src/features/wormhole-sites/api-contract.ts#L102-L109) — Sixth copy, named POSTGRES_SERIAL_MAX and piped from a route-param string.
- [`src/data/telemetry/queries.ts:505-509, 559-584`](../../src/data/telemetry/queries.ts#L505-L509) — WriteBehindOutcome.outcome is typed as string, so widening prices to the three-value union is compatible.
- [`src/app/(site)/admin/ops-view.ts:80-82`](../../src/app/%28site%29/admin/ops-view.ts#L80-L82) — Counts every non-'succeeded' outcome as a failure, so 'partial' already works.
- [`src/app/api/market-prices/refresh/route.ts:23-26`](../../src/app/api/market-prices/refresh/route.ts#L23-L26) — Observer that emits market_price_write_behind.
- [`src/app/api/market-history/refresh/route.ts:21-24`](../../src/app/api/market-history/refresh/route.ts#L21-L24) — Observer that emits market_history_write_behind.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/market-history/ingest.ts:48-107`](../../src/data/market-history/ingest.ts#L48-L107) — Batching rejected. persistHistory runs inside after() off the response path, and the on-view caller sends one product type (history route comment, lines 10-13), with a maximum of 50. One batch would collapse per-type isolation (the 'partial' outcome) and the per-type revalidateTag.
- [`src/data/market-prices/refresh-on-view.ts:95`](../../src/data/market-prices/refresh-on-view.ts#L95) — The [...new Set] here is cosmetic. marketRefreshRoute already dedupes (src/app/api/market-refresh-route.ts:34), dedupe() is the same expression (src/lib/array.ts:1-3), and the repo has 33 such inline sites. Swapping one site is not a finding.
- [`src/data/market-prices/refresh-on-view.ts:73-89`](../../src/data/market-prices/refresh-on-view.ts#L73-L89) — mapBounded is a different concept (a bounded worker pool). See notes for the separate lead.
- [`src/composition/board/demo-board.ts:51`](../../src/composition/board/demo-board.ts#L51) — JITA_4_4 duplicates JITA_44_STATION_ID, but this is a demo fixture; leave it.

</details>

**Home.** `New src/lib/write-behind.ts. THE_FORGE_REGION_ID moves to src/data/eve-data/constants.ts. The int4 id schema goes in src/transport (for example src/transport/schemas.ts), unless the contracts work already provides one.`

**Boundary check.** market-prices and market-history are data zones (autoDiscover src/data). The data rule allows lib, so both may import src/lib/write-behind.ts. The lib rule allows only config, and the runner needs only console, so it is legal there. after() stays at the call sites because it comes from next/server. data cannot import a sibling data slice except data/eve-data, which the data rule allows, so the region id goes in src/data/eve-data/constants.ts. src/config/esi.ts would also be legal (data may import config), but it holds ESI request posture, not universe ids. The int4 schema goes in transport: data may import transport, features may import transport, and transport itself may import only lib (zod is an npm dependency).

**API sketch.**

```ts
// src/lib/write-behind.ts
export interface WriteBehindResult { outcome: 'succeeded' | 'partial' | 'failed'; attempted: number; written: number; durationMs: number }
export type WriteBehindObserver = (result: WriteBehindResult) => void;
export interface WriteBehindTally { succeeded: number; written: number }
/** Times persist, logs a thrown persist as `[${scope}] write-behind failed`, derives the outcome, and notifies without letting the observer throw. */
export function runWriteBehind(scope: string, attempted: number, persist: () => Promise<WriteBehindTally>, observer?: WriteBehindObserver): Promise<void>;
// src/data/eve-data/constants.ts
export const THE_FORGE_REGION_ID = 10_000_002;
// src/transport/schemas.ts (only if not already provided)
export const PG_INT4_MAX = 2_147_483_647;
export const pgInt4IdSchema = z.number().int().positive().max(PG_INT4_MAX);
```

**Migration steps.**

1. Add src/lib/write-behind.ts with runWriteBehind. Record startedAt. Call persist; if it throws, log `[${scope}] write-behind failed` with the error and use { succeeded: 0, written: 0 }. Set outcome to 'succeeded' when succeeded >= attempted, 'failed' when it is 0, and 'partial' otherwise. Call observer inside try/catch, logging `[${scope}] write-behind observer failed`. Resolve undefined. Add src/lib/write-behind.test.ts in the same change (fallow coverage requireAllFiles).
2. In market-prices/refresh-on-view.ts, delete lines 35-51 and type onWriteBehind as WriteBehindObserver. Replace lines 155-176 with: after(() => runWriteBehind('market-prices/refresh-on-view', freshRaws.length, async () => ({ succeeded: freshRaws.length, written: (await persistPrices(db, freshRaws)).written }), onWriteBehind)).
3. In market-history/refresh-on-view.ts, delete lines 26-42. Replace lines 95-115 with after(() => runWriteBehind('market-history/refresh-on-view', results.length, async () => { ...the per-type loop exactly as today, including its per-type console.error and revalidateTag(historyTag(r.typeId), 'max'); return { succeeded, written }; }, onWriteBehind)).
4. Add THE_FORGE_REGION_ID to src/data/eve-data/constants.ts. Point market-history/source.ts:11,47 and market-prices/source.ts:4,170,174 at it. Delete market-history/constants.ts:1 and market-prices/constants.ts:1.
5. Overlap the reads. In prices, use `const [seed, live] = await Promise.all([getPrices(ids), mapBounded(ids, PER_TYPE_CONCURRENCY, ...)])`. In history, use `const [meta, stored] = await Promise.all([getHistoryMeta(ids), getStoredHistory(ids)])` before computing staleIds, and delete the later await at line 80.
6. In market-history/ingest.ts, delete the local retentionCutoff (lines 17-20) and compute formatIsoDay(retentionCutoff(HISTORY_RETENTION_DAYS, now)) from @/lib/batched-delete and @/lib/format/time at lines 31 and 91. The date-string semantics for the date column stay the same. Keep DAY_MS; line 35 still uses it.
7. For the int4 schema: consume the shared schema if the contracts work has landed one. Otherwise add pgInt4IdSchema in src/transport and migrate all six PG_INT4_MAX copies (two market contracts, custom-structures, industry-planner, owned-structures, wormhole-sites). Keep each .min(1)/.max(ON_DEMAND_*_MAX_TYPE_IDS) bound at its call site; no typeIdBatchSchema wrapper is needed.

**Tests.** Add src/lib/write-behind.test.ts. It should cover the succeeded, partial and failed outcomes; a throwing persist giving 'failed' with written 0 and an error log; a throwing observer being swallowed while the promise resolves undefined; and durationMs being a number. Existing guards are src/data/market-prices/refresh-on-view.test.ts:131-175 (scheduling, observer outcome, observer failure resolves undefined) and src/data/market-history/refresh-on-view.test.ts:57-117. Add the missing slice cases: prices 'failed' when persistPricesMock rejects, and history 'partial' with two results where persistHistory rejects one. Today only 'succeeded' is asserted (prices:156, history:79). The read-overlap change keeps the existing order-independent mocks green. Optionally assert that getStoredHistory is called with all ids even when none are stale. The market source tests guard the region-id move, and both api-contract.test.ts files guard the schema bounds.

**Notes.** Drift: history's 'partial' is the correct superset. Prices cannot be partial today because persistPrices is one batch, so the narrower union is not a bug, and widening is safe for data/telemetry (outcome: string) and ops-view. Keep the per-type error log in history because it identifies the failing write. Keep after() and revalidateTag in the slices. For the prices overlap: if getPrices rejects, the ESI fetches still run and fill the 30-60s remote cache before the rejection surfaces. Today a seed failure stops before any ESI call. This is acceptable. The PG_INT4_MAX piece is cross-cutting and should be coordinated with the contracts audit so it is done once. Separate lead, not part of this refactor: there are five hand-rolled bounded worker pools that could become one src/lib mapBounded, which every zone may import. They are src/data/market-prices/refresh-on-view.ts:73-89 (collects results), src/data/market-prices/source.ts:65-90 (fail-fast cancel), src/data/market-history/source.ts:50-66, src/data/eve-data/entity-names.ts:25-44 (inline), and src/composition/map-affiliation-access.ts:41-56 (inline, with a deadline). They differ in cancellation and deadline behaviour.

<sub>Reported by: area:data-services, concern:esi-sync, dupes-triage-1.</sub>

<a id="p295"></a>

## P295: Batch the Fuzzwork fallback in the on-view price refresh instead of one request per type

- **Status:** [ ] not started
- **Category:** efficiency · **Kind:** efficiency · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about +30 / -8 across source.ts and refresh-on-view.ts, plus tests
- **Depends on:** [P335](wave-01-quick-wins-delete-dead-code-fix-small.md#p335), [P332](#p332)
- **Existing primitive:** `src/data/market-prices/source-fallback.ts:fetchPricesFromFuzzwork`

**Problem.** The on-view refresh (POST /api/market-prices/refresh, at most 50 ids per call) caches each type separately. When ESI fails or its budget is exhausted, every type falls back to Fuzzwork alone. One degraded refresh of 50 types therefore makes 50 Fuzzwork aggregate requests at concurrency 10, where a single request would do: Fuzzwork takes a type list, and fetchPricesFromFuzzwork already chunks by 150. Each worker can also wait for an ESI timeout and then a Fuzzwork timeout in turn, for each of 5 rounds, which strains maxDuration=60.

**Sites (11).**

- [`src/data/market-prices/refresh-on-view.ts:59-71`](../../src/data/market-prices/refresh-on-view.ts#L59-L71) — fetchLivePrice('use cache: remote', 30s life) calls fetchPricesFromSource([typeId]) for a single id
- [`src/data/market-prices/refresh-on-view.ts:111-128`](../../src/data/market-prices/refresh-on-view.ts#L111-L128) — Seed read, then mapBounded(ids, PER_TYPE_CONCURRENCY) over fetchLivePrice; a thrown call falls back to the seed
- [`src/data/market-prices/refresh-on-view.ts:137-153`](../../src/data/market-prices/refresh-on-view.ts#L137-L153) — Tally keys on raw.source === 'esi' and otherwise counts the row as a fuzzwork fallback
- [`src/data/market-prices/source.ts:203-248`](../../src/data/market-prices/source.ts#L203-L248) — fetchViaEsiPerType collects fallbackNeeded and calls fallbackToFuzzwork, which relabels rows 'fuzzwork-fallback'
- [`src/data/market-prices/source.ts:259-282`](../../src/data/market-prices/source.ts#L259-L282) — Fewer than BULK_THRESHOLD ids take the per-type path, so one id always does
- [`src/data/market-prices/source-fallback.ts:107-119`](../../src/data/market-prices/source-fallback.ts#L107-L119) — fetchPricesFromFuzzwork dedupes and chunks by MAX_BATCH=150
- [`src/data/market-prices/constants.ts:10-18`](../../src/data/market-prices/constants.ts#L10-L18) — BULK_THRESHOLD 100, PER_TYPE_CONCURRENCY 10, ON_DEMAND_REFRESH_MAX_TYPE_IDS 50
- [`src/data/market-prices/use-refresh-on-view.ts:91`](../../src/data/market-prices/use-refresh-on-view.ts#L91) — The client chunks a view into 50-id refresh calls, so the fan-out repeats for each chunk
- [`src/app/api/market-prices/refresh/route.ts:10-26`](../../src/app/api/market-prices/refresh/route.ts#L10-L26) — maxDuration comment budgets per-type ESI rounds plus the Fuzzwork fallback (observed peak 38.8s)
- [`src/composition/__tests__/vendor-resilience-registry.ts:187-201`](../../src/composition/__tests__/vendor-resilience-registry.ts#L187-L201) — Fuzzwork policy: 'No app-side limiter; this is the low-volume fallback source'
- [`src/data/market-prices/ingest.ts:24-41`](../../src/data/market-prices/ingest.ts#L24-L41) — Cron refreshPrices calls fetchPricesFromSource(typeIds) once, so its fallback is already batched

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/market-prices/ingest.ts:24-41`](../../src/data/market-prices/ingest.ts#L24-L41) — The cron path already batches; leave it unchanged. fetchPricesFromSource must keep its current behavior for it
- [`src/data/market-history/source.ts:50-65`](../../src/data/market-history/source.ts#L50-L65) — A third bounded-concurrency helper (with refresh-on-view mapBounded 73-89 and market-prices/source runConcurrent 65-90). That is a separate dedup lead, not part of this efficiency fix

</details>

**Home.** `src/data/market-prices/source.ts (export the ESI-only per-type fetch and the relabeling fallback); the consumer is src/data/market-prices/refresh-on-view.ts`

**Boundary check.** Everything stays inside the data zone (src/data/market-prices, autoDiscover 'data'). source.ts already imports platform/esi and lib (the data rule allows 'platform/esi' and 'lib'). refresh-on-view.ts imports ./source within the same slice. The route (api zone) still imports only getLivePrices; the api rule allows 'data'. No new cross-zone edge.

**API sketch.**

```ts
// source.ts
export interface EsiPerTypeOutcome { prices: RawMarketPrice[]; failed: number[]; budgetExhausted: boolean }
export async function fetchPricesFromEsiPerType(typeIds: number[]): Promise<EsiPerTypeOutcome> // today's runConcurrent loop (206-233), no fallback
export async function fetchFuzzworkFallback(typeIds: number[]): Promise<RawMarketPrice[]> // today's fallbackToFuzzwork, exported; rows labeled 'fuzzwork-fallback'
// fetchViaEsiPerType = fetchPricesFromEsiPerType + fetchFuzzworkFallback(failed)
// refresh-on-view.ts
async function fetchLivePrice(typeId: number): Promise<{ raw: RawMarketPrice | null; esiFailed: boolean; budgetExhausted: boolean; resolutionId: string }>
```

**Migration steps.**

1. In source.ts, extract the runConcurrent loop in fetchViaEsiPerType (lines 206-233) into an exported fetchPricesFromEsiPerType(typeIds) that returns { prices, failed: fallbackNeeded, budgetExhausted }. Rename fallbackToFuzzwork to fetchFuzzworkFallback and export it. Rebuild fetchViaEsiPerType from the two, so fetchPricesFromSource behaves exactly as before.
2. In refresh-on-view.ts, make fetchLivePrice call fetchPricesFromEsiPerType([typeId]) and return { raw: prices[0] ?? null, esiFailed: failed.length > 0, budgetExhausted, resolutionId }. Drop the fetchPricesFromSource import.
3. In getLivePrices after mapBounded, collect failedIds from the entries with esiFailed, and set esiFailed: true in the catch branch at 120-127 so an infrastructure throw still gets a fallback. If failedIds is non-empty, make one try { await fetchFuzzworkFallback(failedIds) } call; on throw, log and keep the seed. Index the rows by typeId and write each into live[i] with cacheHit false.
4. Leave the tally loop (137-153) and the write-behind unchanged. Fallback rows still read source 'fuzzwork-fallback' and count toward degraded.fuzzworkFallbackCount and metrics.fuzzworkFallbackCount.
5. Update the maxDuration comment in src/app/api/market-prices/refresh/route.ts: there are now ESI rounds plus a single Fuzzwork request.
6. Before coding, have docs-researcher confirm the 'use cache: remote' semantics for a returned failure value in this Next version.

**Tests.** refresh-on-view.test.ts mocks './source' fetchPricesFromSource at 7-15. Switch it to mock fetchPricesFromEsiPerType and fetchFuzzworkFallback, then add: (a) three ESI-failed ids make exactly one fetchFuzzworkFallback call carrying all three; (b) when the batched Fuzzwork call throws, the seed is returned and nothing throws; (c) no Fuzzwork call when ESI returns every row; (d) budgetExhausted is still reported. Adapt the test at 177 ('tallies esi vs fuzzwork-fallback and budget exhaustion'). In source.test.ts, add a test that fetchPricesFromEsiPerType returns failed ids without calling Fuzzwork. The existing per-type fallback tests at 285, 310 and 326 guard the unchanged fetchPricesFromSource.

**Notes.** Behavior differences to handle: (1) Fallback rows leave the per-type cache. An ESI failure is now cached as { raw: null, esiFailed: true } for LIVE_CACHE_LIFE (30s), so ESI retries keep today's cadence; the cached fallback row already blocks ESI retries for 30s. Fuzzwork then runs once per view per 50 ids or fewer, instead of once per type per 30s; the 20/min per-client route limiter bounds that. Caching the batched fallback under a sorted-id key would rarely hit, so do not add it. (2) Today, when Fuzzwork also fails, fetchLivePrice throws and nothing is cached. After the change, the ESI failure is cached for 30s whatever happens. (3) Keep the 'fuzzwork-fallback' label, not 'fuzzwork', because the tallies and the price_source_degraded telemetry in the route depend on it. (4) Worst-case latency improves: today a worker can wait out a 10s ESI timeout and then a 10s Fuzzwork timeout in each of 5 rounds; batching leaves one Fuzzwork request after the ESI rounds. (5) The mid-batch budget short-circuit in fetchViaEsiPerType does not matter per type: the pre-dispatch gate throws without a network call.

<sub>Reported by: concern:esi-sync.</sub>

<a id="p076"></a>

## P076: Name the plain price-figure type in data/market-prices and build RefreshedPrice, PriceLite and the planner rows from it

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -45 / +20 (four restatements become derivations; one builder and one row walk shared)
- **Depends on:** [P304](wave-01-quick-wins-delete-dead-code-fix-small.md#p304)
- **Existing primitive:** `src/data/market-prices/narrow.ts:toPlainPriceFigures; src/data/market-prices/types.ts:PricedFigures`

**Problem.** The plain (number-volume) price figures have no name. toPlainPriceFigures takes an inline anonymous restatement of PricedFigures and returns an inferred type. RefreshedPrice and PriceLite each restate that output field by field. The planner's MaterialCostRow and IntermediatePrice restate rowPriceFields' output, and initialPriceMap and buildConfidenceInputs repeat the same rows ∪ intermediatePrices walk. Adding a figure means editing four or five hand-written shapes, and the spread-based builders would not fail the build if one is missed.

**Verifier revision.** The data-layer core holds. narrow.ts takes an anonymous restatement of the figures and returns an unnamed type, and RefreshedPrice (use-refresh-on-view.ts:11-24) and PriceLite (build-pricing.ts:39-51) restate that output by hand. readBatch builds RefreshedPrice by spreading toPlainPriceFigures. Spreads skip excess-property checks, so a figure added in narrow.ts would quietly fall out of the type. The 'toPlainPriceFigures + source + staleAfterMs' builder also appears twice, in readBatch and in industry-planner/queries.ts. Three parts of the proposal do not survive. (1) encodeWirePrice has one consumer, and apiResponse already type-checks the route's object against wirePriceSchema, so it cannot drift silently. (2) BookSides, ConfidenceInput and the { bestSell } inputs are deliberately minimal structural parameters of pure functions; deriving them from a storage shape adds coupling for no safety. (3) MaterialCostRow and IntermediatePrice are the planner's serialized view rows, with unitBuy renamed and extra columns. They should derive from the feature's own rowPriceFields, not from data types. A further feature-local duplicate was found: initialPriceMap and buildConfidenceInputs both walk rows ∪ intermediatePrices by typeId and rename unitBuy/bestBuy in opposite directions.

**Sites (9).**

- [`src/data/market-prices/types.ts:13-34`](../../src/data/market-prices/types.ts#L13-L34) — PricedFigures (bigint volumes), MarketPrice, PriceSource, RawMarketPrice
- [`src/data/market-prices/narrow.ts:3-25`](../../src/data/market-prices/narrow.ts#L3-L25) — Anonymous input restatement; unnamed inferred output
- [`src/data/market-prices/use-refresh-on-view.ts:11-24, 47-56`](../../src/data/market-prices/use-refresh-on-view.ts#L11-L24) — RefreshedPrice restates plain figures; readBatch spreads toPlainPriceFigures plus source plus staleAfterMs
- [`src/features/industry-planner/queries.ts:217-227`](../../src/features/industry-planner/queries.ts#L217-L227) — Second 'plain figures + source + staleAfterMs' builder, server side, from a MarketPrice Date
- [`src/features/industry-planner/build-pricing.ts:39-51, 72-82, 101-120`](../../src/features/industry-planner/build-pricing.ts#L39-L51) — PriceLite restatement; rowPriceFields (the real source of the row shape); buildConfidenceInputs walk
- [`src/features/industry-planner/types.ts:64-89`](../../src/features/industry-planner/types.ts#L64-L89) — MaterialCostRow and IntermediatePrice restate rowPriceFields' output
- [`src/features/industry-planner/initial-price-map.ts:4-48`](../../src/features/industry-planner/initial-price-map.ts#L4-L48) — Same rows ∪ intermediatePrices walk as buildConfidenceInputs, renaming unitBuy to bestBuy
- [`src/features/industry-planner/price-snapshot.ts:1-42`](../../src/features/industry-planner/price-snapshot.ts#L1-L42) — Returns RefreshedPrice where PriceLite is expected; the derivation must keep that assignable
- [`src/data/market-prices/api-contract.ts:27-41`](../../src/data/market-prices/api-contract.ts#L27-L41) — wirePriceSchema (string volumes, optional regionalDiscount)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/market-prices/refresh/route.ts:43-62`](../../src/app/api/market-prices/refresh/route.ts#L43-L62) — The only wire encoder. apiResponse (src/transport/api-response.ts:25-32) types the body against wirePriceSchema, so a field change breaks the build. encodeWirePrice would have one consumer.
- [`src/features/net-worth/valuation.ts:56-61`](../../src/features/net-worth/valuation.ts#L56-L61) — BookSides is a minimal structural input for pure valuation functions. Leave it narrow.
- [`src/features/industry-planner/industry-styles.ts:163-168`](../../src/features/industry-planner/industry-styles.ts#L163-L168) — ConfidenceInput is an intentionally narrow input that names the field unitBuy
- [`src/features/wormhole-sites/scanner-live-isk.ts:13`](../../src/features/wormhole-sites/scanner-live-isk.ts#L13) — A minimal { bestSell } structural parameter, not a figure restatement

</details>

**Home.** `src/data/market-prices/types.ts (PriceFigures<V>, PlainPriceFigures) + src/data/market-prices/narrow.ts (typed toPlainPriceFigures, new toClientPrice); feature-local RowPriceFields/pricedRows in src/features/industry-planner/build-pricing.ts`

**Boundary check.** The new types live in data/market-prices (data zone). Consumers: data/market-prices itself; features/industry-planner (build-pricing, queries, types, initial-price-map, price-snapshot) under from:features allow[data]; features/wormhole-sites (ScannerLivePrices, site-live-context use RefreshedPrice) under from:features allow[data]. The planner's row helpers stay in features/industry-planner, used only inside that slice. No new import from data into features.

**API sketch.**

```ts
// data/market-prices/types.ts
export interface PriceFigures<V> { bestBuy: number | null; bestSell: number | null; pct5Buy: number | null; pct5Sell: number | null; buyVolume: V | null; sellVolume: V | null; buyDepth: DepthBand[] | null; sellDepth: DepthBand[] | null; regionalDiscount: RegionalDiscount | null }
export interface PricedFigures extends PriceFigures<bigint> { typeId: number; source: PriceSource }
export type PlainPriceFigures = PriceFigures<number>;
// data/market-prices/narrow.ts
export function toPlainPriceFigures(p: Omit<PriceFigures<bigint | string>, 'regionalDiscount'> & { regionalDiscount?: RegionalDiscount | null }): PlainPriceFigures;
export function toClientPrice(p: Parameters<typeof toPlainPriceFigures>[0] & { source: PriceSource }, staleAfterMs: number): PlainPriceFigures & { source: PriceSource; staleAfterMs: number };
// use-refresh-on-view.ts
export type RefreshedPrice = { typeId: number } & ReturnType<typeof toClientPrice>;
// features/industry-planner/build-pricing.ts
export type PriceLite = Omit<PlainPriceFigures, 'buyDepth' | 'sellDepth' | 'regionalDiscount'> & Partial<Pick<PlainPriceFigures, 'buyDepth' | 'sellDepth' | 'regionalDiscount'>> & { source: PriceSource | null; staleAfterMs: number | null };
type RowPriceFields = ReturnType<typeof rowPriceFields>;
// types.ts: MaterialCostRow = { typeId; name; quantity; unitBuy; extendedCost } & RowPriceFields; IntermediatePrice = { typeId; bestBuy } & RowPriceFields
function pricedRows(pricing: BlueprintPricing): Iterable<IntermediatePrice>; // rows mapped unitBuy→bestBuy, then intermediatePrices
```

**Migration steps.**

1. In types.ts, add PriceFigures<V>, re-express PricedFigures as `interface PricedFigures extends PriceFigures<bigint> { typeId; source }`, and export PlainPriceFigures. MarketPrice and RawMarketPrice stay as they are.
2. In narrow.ts, type the toPlainPriceFigures parameter from PriceFigures<bigint | string>, keeping regionalDiscount optional for the wire shape, and annotate the return as PlainPriceFigures. Add toClientPrice(p, staleAfterMs).
3. In use-refresh-on-view.ts, redefine RefreshedPrice as { typeId } & PlainPriceFigures & { source; staleAfterMs } and build it in readBatch with toClientPrice(p, Date.parse(p.staleAfter)).
4. In industry-planner/queries.ts:219-226, replace the hand-built object with toClientPrice(p, p.staleAfter.getTime()).
5. In build-pricing.ts, derive PriceLite from PlainPriceFigures (depth and discount optional, source and staleAfterMs nullable). Name RowPriceFields from rowPriceFields' return type.
6. In industry-planner/types.ts, rewrite MaterialCostRow and IntermediatePrice as intersections with RowPriceFields. Their field sets are unchanged.
7. Add pricedRows(pricing) in build-pricing.ts and use it in both initialPriceMap and buildConfidenceInputs. Keep the explicit product entry in initialPriceMap.

**Tests.** narrow.test.ts: add a type-level check that toPlainPriceFigures(MarketPrice) and toPlainPriceFigures(wire row) both satisfy PlainPriceFigures, and that string and bigint volumes become numbers; add a toClientPrice case for each staleAfter source (Date.getTime, Date.parse). use-refresh-on-view.test.ts already pins the readBatch output and must stay green unchanged. build-pricing.test.ts (a churn hotspot) guards rowPriceFields, buildConfidenceInputs and assemblePricing output; add a case where an intermediate overrides a material row of the same typeId in both pricedRows consumers. Add or extend an initial-price-map test asserting the map values have exactly the PriceLite keys (no stray typeId) for rows, intermediates and the product.

**Notes.** Must preserve these deliberate differences: PriceLite.buyDepth/sellDepth/regionalDiscount stay optional (initialPriceMap leaves regionalDiscount off rows and intermediates), PriceLite.source and staleAfterMs stay nullable, MaterialCostRow keeps unitBuy, and the wire regionalDiscount stays `.nullable().optional()`, which toPlainPriceFigures maps to null. RefreshedPrice must stay assignable to PriceLite because price-snapshot.ts returns it as one. With a spread in pricedRows, do not let typeId leak into PriceLite values: map explicitly, since planner tests compare map values with toEqual. Do not add encodeWirePrice. One encoder that apiResponse already type-checks is not a second consumer.

<sub>Reported by: concern:contracts-types, dupes-triage-1.</sub>

<a id="p075"></a>

## P075: Put both name clients and both hooks in data/eve-data, with one normalize and an explicit label

- **Status:** [ ] not started
- **Category:** client-data · **Kind:** simplification · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -30 / +12 (three files deleted; label and filter folded into one normalize)
- **Depends on:** —
- **Existing primitive:** `src/data/eve-data/names-client.ts:createNamesClient`

**Problem.** Type and entity name resolution are parallel instances of createNamesClient/useNames, scattered across four files in two zones. names-client.ts derives its error label from `endpoint.path.includes('type-names')`. Its normalize applies the positive-integer filter only when policy.cache is true, so the uncached entity path can send invalid ids that make the whole request fail validation. The two request schemas restate the same shape with separate (equal) max constants.

**Sites (11).**

- [`src/data/eve-data/names-client.ts:5-47`](../../src/data/eve-data/names-client.ts#L5-L47) — Branch-dependent normalize (10-15); label sniffed from the path (20)
- [`src/data/eve-data/type-names-client.ts:1-8`](../../src/data/eve-data/type-names-client.ts#L1-L8) — One-line client instance
- [`src/data/eve-data/use-type-names.ts:1-8`](../../src/data/eve-data/use-type-names.ts#L1-L8) — One-line hook
- [`src/data/eve-data/use-names.ts:1-28`](../../src/data/eve-data/use-names.ts#L1-L28) — Existing shared hook. idsKey comes from client.normalize, so the filter fix also changes which ids key the effect.
- [`src/components/use-entity-names.ts:1-14`](../../src/components/use-entity-names.ts#L1-L14) — Entity client and hook in the components zone
- [`src/data/eve-data/api-contract.ts:24-37, 50-68`](../../src/data/eve-data/api-contract.ts#L24-L37) — Two identical request schemas; the response schema is already shared
- [`src/mapper/windows/SystemIntelligenceBody.tsx:7, 9, 225-226`](../../src/mapper/windows/SystemIntelligenceBody.tsx#L7) — Imports both hooks from two zones
- [`src/mapper/tracking/use-character-identities.ts:4, 19`](../../src/mapper/tracking/use-character-identities.ts#L4) — useEntityNames consumer
- [`src/features/industry-jobs/components/CorpJobsBoard.tsx:6, 79-81`](../../src/features/industry-jobs/components/CorpJobsBoard.tsx#L6) — useEntityNames consumer; caps ids itself with ENTITY_NAMES_MAX_IDS
- [`src/data/eve-data/names-client.test.ts:1-32`](../../src/data/eve-data/names-client.test.ts#L1-L32) — Builds clients with createNamesClient and asserts the 'type names 503' label
- [`src/data/eve-data/type-names-client.test.ts:1-27`](../../src/data/eve-data/type-names-client.test.ts#L1-L27) — Asserts the cached path filters -1, NaN and 1.5

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/eve/names/route.ts:1-19`](../../src/app/api/eve/names/route.ts#L1-L19) — Server route backed by resolveEntityNames (ESI, mutable). It is a different resolver from the type route, so do not merge the routes.
- [`src/app/api/eve/type-names/route.ts:1-23`](../../src/app/api/eve/type-names/route.ts#L1-L23) — Server route backed by getTypeNames (SDE). It dedupes server-side; keep it separate.

</details>

**Home.** `src/data/eve-data/names-client.ts (both client instances) and src/data/eve-data/use-names.ts (both hooks, 'use client')`

**Boundary check.** Home zone is data (src/data/eve-data). Consumers: mapper (SystemIntelligenceBody, use-character-identities) under from:mapper allow[data]; features (CorpJobsBoard) under from:features allow[data]. names-client imports transport/api-client under from:data allow[transport]. Deleting src/components/use-entity-names.ts removes the only components-zone hop.

**API sketch.**

```ts
// names-client.ts
type NamesPolicy = { label: 'type' | 'entity'; maxIds: number; cache: boolean; retryMs?: number };
export function createNamesClient(endpoint: typeof entityNamesEndpoint | typeof typeNamesEndpoint, policy: NamesPolicy): NamesClient;
// normalize: [...new Set(ids)].filter(id => Number.isInteger(id) && id > 0).sort((a,b)=>a-b), then .slice(0, maxIds) when !cache
export const typeNamesClient: NamesClient;   // cache: true, retryMs: 15_000
export const entityNamesClient: NamesClient; // cache: false (names are mutable)
// use-names.ts ('use client')
export function useTypeNames(ids: readonly number[]): Record<string, string>;
export function useEntityNames(ids: readonly number[]): Record<string, string>;
// api-contract.ts (optional)
const namesRequestSchema = (max: number) => z.object({ ids: z.array(z.number().int().positive()).min(1).max(max) });
```

**Migration steps.**

1. In names-client.ts, add `label` to the policy and use it in the error message instead of the path sniff. Make normalize filter positive integers on both branches before the uncached slice.
2. Move typeNamesClient into names-client.ts and add entityNamesClient there (cache: false, maxIds: ENTITY_NAMES_MAX_IDS).
3. In use-names.ts, add a 'use client' directive (both current hook files have one) and export useTypeNames and useEntityNames. Un-export useNames if nothing outside the file imports it, or Fallow will flag it as an unused export.
4. Repoint imports in SystemIntelligenceBody.tsx:7,9, use-character-identities.ts:4 and CorpJobsBoard.tsx:6 to '@/data/eve-data/use-names'.
5. Delete type-names-client.ts, use-type-names.ts and src/components/use-entity-names.ts. Do not leave a re-export, which would be a barrel with no purpose.
6. Update the vi.mock paths from '@/components/use-entity-names' to '@/data/eve-data/use-names' in SystemIntelligenceBody.test.ts:35, SystemIntelligenceBody.effect.test.ts:21 and DockCharacterPicker.test.ts:19. Fold type-names-client.test.ts into names-client.test.ts.
7. Optional: replace typeNamesRequestSchema and entityNamesRequestSchema with namesRequestSchema(TYPE_NAMES_MAX_IDS / ENTITY_NAMES_MAX_IDS). Keep both exported names, because the routes and coverage.test.ts import them.

**Tests.** names-client.test.ts: add 'uncached client drops non-positive and non-integer ids before capping', for example load([0, -1, 1.5, NaN, 3, 2, 1]) with maxIds 2 sending { ids: [1, 2] }. Assert that the 'entity names <status>' and 'type names <status>' labels come from the policy. Move the batching, caching and retry assertions from type-names-client.test.ts unchanged to the exported typeNamesClient. The existing component tests that mock the hook (SystemIntelligenceBody.test.ts, SystemIntelligenceBody.effect.test.ts, DockCharacterPicker.test.ts) only need the mock path changed.

**Notes.** Must preserve: entity names stay uncached (mutable, re-requested on every load) and type names stay cached and batched with a 15s retry. The cached path is the correct normalize; the uncached path has drifted and should gain the filter. Filter before slicing so invalid ids do not use up the 200-id cap. CorpJobsBoard already pre-caps with corpEntityIds(…, ENTITY_NAMES_MAX_IDS), so its behaviour is unchanged.

<sub>Reported by: area:data-eve.</sub>

<a id="p063"></a>

## P063: Add a store-backed client resource (memoise until rejected, one shared retry, store-published value) and one apiFetch failure label; rebuild the five singleton index/asset loaders and their hooks on it

- **Status:** [ ] not started
- **Category:** client-data · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** L · **Risk:** medium · **Payoff:** medium · **Size:** About -200 lines across loaders, hooks and adapters; about +110 for the primitive, transport helpers and one-line hooks (net about -90), plus about 120 lines of new tests
- **Depends on:** [P010](wave-08-charts-images-and-board-workspace-adoption.md#p010), [P075](#p075)
- **Existing primitive:** `src/lib/client-store.ts:createClientStore,useClientStore; src/transport/api-client.ts:apiFetch; src/data/eve-data/universe-assets-client.ts:failureLabel (private, to generalise)`

**Problem.** Universe assets, the wormhole codex, the systems index, the stations index and the blueprint index each hand-roll a module-level 'memoise the promise, clear it on rejection' loader. Six modules, these five plus wh-statics and names-client, turn a failed apiFetch outcome into an Error by hand, in two formats: `'status' in r ? r.status : r.kind` and universe-assets-client's private failureLabel (`kind status`). Each singleton has its own consumer hook with per-instance useState and an alive flag, and retry has drifted. useWormholeCodexStatus retries every 10s, with one timer per mounted instance. useSystemName retries every 15s. useUniverseAssets, useStations and useSystemSearch's index effect swallow the rejection and never retry. One transient failure therefore leaves halos, labels and k-space captions empty until remount, while useSystemSearch heals only through a healedRef side channel in suggest(). Every new mount renders null first, even when the value is already loaded. That matters because SystemNode's KnownSpaceCaption subscribes once per k-space node, and React Flow mounts nodes as they scroll into view, so captions flash during a pan. useSystemName and useSystemSearch seed state from getLoadedSystems(), which can hydrate against a value the server never rendered. Consumers also adapt the assets object by hand, writing `assets === null ? null : (id) => assets.systemInfo(id)` four times and spelling out the lookup type five times.

**Verifier revision.** The core holds up. Five singleton 'memoise the promise, forget it on rejection' loaders exist: universe assets, codex, systems, stations and blueprints. Six modules unwrap a failed apiFetch outcome by hand, in two formats. The five hooks over those singletons have drifted retry policies: the codex retries every 10s, useSystemName every 15s, and assets, stations and the useSystemSearch index load never retry, even though the loaders clear a failed promise precisely so a retry can succeed (use-system-statics.ts:55-56). The null-first render is real and matters more than claimed: ChainSurface sets onlyRenderVisibleElements (ChainSurface.tsx:81), so every k-space SystemNode that pans into view mounts KnownSpaceCaption fresh and paints one frame without its caption. Revisions: (1) Drop the keyed variant. wh-statics/client.ts deliberately keeps only an in-flight dedupe. names-client is a batched per-id cache, and useNames merges results across keys. These are different concepts and adopt only the failure label. (2) Choose the store-backed design (createClientResource over createClientStore) over per-instance useAsyncValue. Besides the shared retry timer and the immediate value on later mounts, it fixes a hydration hazard: useSystemName and useSystemSearch seed useState from getLoadedSystems() (use-system-search.ts:27,50-51), which is the 'reader hydrates against a value the server never rendered' case that client-store.ts:10-22 forbids. (3) Keep the loadUniverseAssets, loadWormholeCodex and loadSystems names, because optimistic-authoring.ts:499, the preview widget and systemsSource call them outside React. (4) Unifying on the 'kind status' format changes two asserted messages.

**Sites (28).**

- [`src/data/eve-data/universe-assets-client.ts:31-48`](../../src/data/eve-data/universe-assets-client.ts#L31-L48) — two module promise vars, private failureLabel ('kind status'), manifest unwrap
- [`src/data/eve-data/universe-assets-client.ts:57-68, 96-99`](../../src/data/eve-data/universe-assets-client.ts#L57-L68) — 404-tolerant unwraps that must keep returning null on 404; they need only the label
- [`src/data/eve-data/universe-assets-client.ts:138-162`](../../src/data/eve-data/universe-assets-client.ts#L138-L162) — two copies of memoise-and-reset-on-rejection
- [`src/data/eve-data/systems-search.ts:16-40`](../../src/data/eve-data/systems-search.ts#L16-L40) — indexPromise memo, status/kind unwrap, loadedIndex/getLoadedSystems sync mirror
- [`src/data/eve-data/stations-search.ts:11-21`](../../src/data/eve-data/stations-search.ts#L11-L21) — ??= memo, reset inside .then (equivalent, since apiFetch never rejects: api-client.ts:35-46)
- [`src/features/industry-planner/blueprints-source.ts:10-28`](../../src/features/industry-planner/blueprints-source.ts#L10-L28) — fifth memo plus unwrap; its .catch reset is live because the !ok throw rejects
- [`src/data/wh-statics/client.ts:8-15`](../../src/data/wh-statics/client.ts#L8-L15) — status/kind unwrap only
- [`src/data/eve-data/names-client.ts:16-23`](../../src/data/eve-data/names-client.ts#L16-L23) — status/kind unwrap; the label is chosen by sniffing endpoint.path
- [`src/mapper/chain/use-universe-assets.ts:9-27`](../../src/mapper/chain/use-universe-assets.ts#L9-L27) — per-instance state, empty rejection handler, no retry
- [`src/mapper/signatures/use-system-statics.ts:30-71`](../../src/mapper/signatures/use-system-statics.ts#L30-L71) — useWormholeCodexStatus: failed flag kept until success, per-instance 10s retry timer; a general hook housed in signatures
- [`src/components/use-system-search.ts:24-47`](../../src/components/use-system-search.ts#L24-L47) — useSystemName: 15s retry, useState seeded from getLoadedSystems() (hydration hazard)
- [`src/components/use-system-search.ts:49-68, 83-89`](../../src/components/use-system-search.ts#L49-L68) — useSystemSearch: load effect never retries; healedRef peek in suggest() as a heal side channel; seeded from getLoadedSystems()
- [`src/components/composition/industry-workspace/AddFacility.tsx:47-63, 103`](../../src/components/composition/industry-workspace/AddFacility.tsx#L47-L63) — useStations: gated by a sticky `opened`, alive flag, .catch(() => {}), no retry
- [`src/mapper/canvas/SystemNode.tsx:253-256`](../../src/mapper/canvas/SystemNode.tsx#L253-L256) — KnownSpaceCaption: one hook instance per k-space node
- [`src/mapper/canvas/ChainSurface.tsx:81`](../../src/mapper/canvas/ChainSurface.tsx#L81) — onlyRenderVisibleElements: nodes remount on pan, so each pays the null-first frame
- [`src/mapper/windows/MapWindowLayer.tsx:265-266`](../../src/mapper/windows/MapWindowLayer.tsx#L265-L266) — two useSystemLabel instances in one component
- [`src/mapper/windows/use-system-label.ts:6-10`](../../src/mapper/windows/use-system-label.ts#L6-L10) — wraps useUniverseAssets; passes assets?.systemInfo directly, which shows the unbound form is safe
- [`src/mapper/windows/SystemIntelligenceBody.tsx:102-110, 171-173`](../../src/mapper/windows/SystemIntelligenceBody.tsx#L102-L110) — codex `failed` drives the 'unavailable right now' copy; another assets instance
- [`src/mapper/signatures/ActiveSignatureEditor.tsx:62-63`](../../src/mapper/signatures/ActiveSignatureEditor.tsx#L62-L63) — systemInfo adapter
- [`src/mapper/signatures/use-signature-jump-flow.ts:27, 43`](../../src/mapper/signatures/use-signature-jump-flow.ts#L27) — systemInfo adapter
- [`src/mapper/signatures/scanner-wormhole-cells.tsx:92, 99-100`](../../src/mapper/signatures/scanner-wormhole-cells.tsx#L92) — systemInfo adapter
- [`src/mapper/chain/use-map-chain-halo.ts:27, 48-55`](../../src/mapper/chain/use-map-chain-halo.ts#L27) — systemInfo adapter in labelOf
- [`src/mapper/chain/labels.ts:15`](../../src/mapper/chain/labels.ts#L15) — lookup type spelled out
- [`src/mapper/signatures/origin-leads.ts:16`](../../src/mapper/signatures/origin-leads.ts#L16) — lookup type spelled out
- [`src/mapper/signatures/system-readout.ts:10`](../../src/mapper/signatures/system-readout.ts#L10) — lookup type spelled out
- [`src/mapper/signatures/jump-resolution.ts:112, 134`](../../src/mapper/signatures/jump-resolution.ts#L112) — lookup type spelled out twice
- [`src/mapper/chain/optimistic-authoring.ts:499`](../../src/mapper/chain/optimistic-authoring.ts#L499) — non-React caller of loadWormholeCodex; the export must stay
- [`src/app/(site)/preview/widgets/universe-assets-proof.tsx:40-41`](../../src/app/%28site%29/preview/widgets/universe-assets-proof.tsx#L40-L41) — non-React caller of both loaders

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/eve-data/names-client.ts:24-45`](../../src/data/eve-data/names-client.ts#L24-L45) — Batched per-id promise cache over many keys, not a singleton resource; only the failure label applies
- [`src/data/wh-statics/client.ts:17-25`](../../src/data/wh-statics/client.ts#L17-L25) — Keyed in-flight dedupe that intentionally keeps no result; a keyed resource variant would add a concept for one site
- [`src/data/eve-data/use-names.ts:4-28`](../../src/data/eve-data/use-names.ts#L4-L28) — Merges results across idsKey changes, with retry from the client's policy (entity names none, type names 15s); not a singleton read
- [`src/data/wh-statics/use-system-static-codes.ts:4-16`](../../src/data/wh-statics/use-system-static-codes.ts#L4-L16) — Keyed per system with no retained value; leave as is (optional: a retry could be added separately)
- [`src/platform/search/index.ts:64-80`](../../src/platform/search/index.ts#L64-L80) — Same memo shape, but platform/search may import nothing (.fallowrc rule from platform/search allow [])
- [`src/components/use-system-search.ts:78-82`](../../src/components/use-system-search.ts#L78-L82) — Abort-previous for suggest() is a different concern (latest-wins call), not resource loading

</details>

**Home.** `src/lib/client-resource.ts (createClientResource, useClientResource). src/transport/api-client.ts (apiFailureLabel, apiFetchData). src/data/eve-data/use-universe-assets.ts (useUniverseAssets, useWormholeCodexStatus, useWormholeCodex), next to use-names.ts and use-type-names.ts. SystemInfoLookup type exported from src/data/eve-data/universe-assets-client.ts.`

**Boundary check.** lib: rule `from lib allow [config]`. client-resource.ts imports only react and ./client-store, which is legal and follows the precedent of client-store.ts, use-hydrating.ts and use-stable-value.ts. transport: rule `from transport allow [lib]`. The new helpers import only ./decode and ./endpoint types. Consumers: data/eve-data and data/wh-statics (`from data allow [... transport, lib ...]`), features/industry-planner blueprints-source (`from features allow [... transport, lib ...]`), components/use-system-search.ts (`from components allow [ui, platform/auth, platform/search, platform/page-settings, data, transport, lib]`), components-composition AddFacility (`allow [... data, transport, lib ...]`), and mapper hooks and adapters (`from mapper allow [features, data, components, ui, transport, lib, config]`). Moving the hooks into data/eve-data is legal because mapper may import data and data may import lib. platform/search is left alone because it may import nothing.

**API sketch.**

```ts
// transport/api-client.ts
export function apiFailureLabel(o: { ok: false; kind: string; status?: number }): string; // 'network' | 'api 500' | 'protocol 200'
export type SuccessDataOf<E extends EndpointContract> = Extract<OutcomeOf<E>, { ok: true }>['data'];
export async function apiFetchData<const E extends EndpointContract>(endpoint: E, label: string, ...args: EndpointCallArgs<E>): Promise<SuccessDataOf<E>>; // throws Error(`${label} ${apiFailureLabel(r)}`)

// lib/client-resource.ts
export interface ResourceState<T> { readonly value: T | null; readonly failed: boolean }
export interface ClientResource<T> {
  load(): Promise<T>;            // memoised; a rejection is forgotten; success/failure published to the store
  peek(): T | null;
  get(): ResourceState<T>;
  subscribe(listener: () => void): () => void; // first subscriber starts a load; a failure arms ONE retry timer while anyone is subscribed; last unsubscribe clears it
  readonly serverValue: ResourceState<T>; // { value: null, failed: false }, a stable object
}
export function createClientResource<T>(read: () => Promise<T>, opts?: { retryMs?: number }): ClientResource<T>;
export function useClientResource<T>(r: ClientResource<T>, enabled = true): ResourceState<T>; // useSyncExternalStore(enabled ? r.subscribe : noop, r.get, () => r.serverValue)

// data/eve-data
export type SystemInfoLookup = UniverseAssets['systemInfo'];
export const loadUniverseAssets = () => universeAssetsResource.load(); // same for loadWormholeCodex, loadSystems, loadStations
export function useUniverseAssets(): UniverseAssets | null;
export function useWormholeCodexStatus(): { codex: WormholeCodex | null; failed: boolean };
```

**Migration steps.**

1. transport: add apiFailureLabel, generalised from universe-assets-client.ts:34-40, and apiFetchData to src/transport/api-client.ts, with tests in api-client.test.ts.
2. Switch the six unwraps to the new helpers. In universe-assets-client.ts, delete the private failureLabel. The manifest read (42-48) uses apiFetchData. The 404-tolerant reads (57-68, 96-99) keep their 404 branch and use apiFailureLabel in the throw. systems-search.ts:21-26, stations-search.ts:15-19, blueprints-source.ts:14-21 and wh-statics/client.ts:8-15 call apiFetchData. names-client.ts takes a `label: 'type names' | 'entity names'` in its policy instead of sniffing endpoint.path (20), and type-names-client.ts and use-entity-names.ts pass it. Update the message assertions in names-client.test.ts:28 and type-names-client.test.ts:21 from 'type names 503' to 'type names api 503'.
3. lib: add src/lib/client-resource.ts and client-resource.test.ts. Loading must stay lazy (no module-level kick-off): subscribe never runs on the server, so SSR never loads.
4. universe-assets-client.ts: replace the two memos (138-162) with `universeAssetsResource = createClientResource(() => loadVersionedAsset(fetchUniverseAssets, ...), { retryMs })` and the codex equivalent. Keep `loadUniverseAssets`/`loadWormholeCodex` as `() => resource.load()`. Export `SystemInfoLookup`.
5. Create src/data/eve-data/use-universe-assets.ts with useUniverseAssets (`useClientResource(universeAssetsResource).value`), useWormholeCodexStatus (`{ codex: value, failed: value === null && failed }`) and useWormholeCodex. Delete src/mapper/chain/use-universe-assets.ts and remove use-system-statics.ts:30-71, keeping destinationClassIdForCode, staticClassForCode and useSystemStaticSlots. Repoint imports in SystemNode, use-system-label, SystemIntelligenceBody, use-signature-jump-flow, ActiveSignatureEditor, scanner-wormhole-cells, use-map-chain-halo, use-map-chain-pages and use-wormhole-editor-data. Update the vi.mock paths in use-system-label.test, SystemIntelligenceBody.test, SystemIntelligenceBody.effect.test, SignatureWindow.test and ActiveSignatureEditor.test.
6. systems-search.ts: create `systemsResource`, make `loadSystems = () => systemsResource.load()`, and delete loadedIndex/getLoadedSystems. In use-system-search.ts, useSystemName becomes `systemNameFrom(useClientResource(systemsResource, systemId !== null).value, systemId)` and SYSTEM_NAME_RETRY_MS is deleted. useSystemSearch uses `useClientResource(systemsResource).value ?? NO_SYSTEMS`, where NO_SYSTEMS is a module const that keeps parse's deps stable. Delete the load effect and the healedRef block (51, 54-68, 83-89): a load from the search palette now publishes to every reader. Rewrite systems-search.test.ts:93-104 to assert peek().
7. stations-search.ts: create stationsResource. In AddFacility.tsx, replace useStations (47-63) with `useClientResource(stationsResource, wanted).value ?? NO_STATIONS`. Update the AddFacilityRow.test.ts mock to export the resource.
8. blueprints-source.ts: replace the memo (10-28) with a createClientResource. It has no hook consumer; load() alone gives the memo semantics.
9. Adapters: in ActiveSignatureEditor.tsx:63, use-signature-jump-flow.ts:43, scanner-wormhole-cells.tsx:99-100 and use-map-chain-halo.ts:52, replace `assets === null ? null : (id: number) => assets.systemInfo(id)` with `assets?.systemInfo ?? null`. systemInfo is a closure that does not use `this`, and use-system-label.ts:9 already passes it this way. In labels.ts:15, origin-leads.ts:16, system-readout.ts:10 and jump-resolution.ts:112 and 134, type the parameter as `SystemInfoLookup | null`.

**Tests.** New tests: src/lib/client-resource.test.ts. It should cover: one load shared by concurrent callers; rejection forgotten, then the next load succeeds; value published to subscribers; peek; the first subscriber starts a load; N subscribers share one retry timer; the timer is cleared when the last subscriber leaves; serverValue is a stable reference; failed stays true through retries until a success. api-client.test.ts should cover apiFailureLabel formats and the apiFetchData throw message. Existing guards to keep green: universe-assets-client.test.ts (memo, stale refetch, 'clears a rejected memo so the next call can heal', 'universe assets api 500'), systems-search.test.ts (memoised index, retry after failure, aborted query), wh-statics/client.test.ts ('system statics network' is unchanged because network has no status), names-client.test.ts and type-names-client.test.ts (message update), SystemIntelligenceBody.effect.test.ts (codex failed/loading copy), and the mapper tests whose mock paths move. Add a hook test showing that a k-space caption mounted after the load renders with data on its first client render.

**Notes.** Correct copy on retry: the loaders' own design (clear on failure so a later attempt succeeds) and useWormholeCodexStatus's comment show that retrying is intended. useUniverseAssets, useStations and the useSystemSearch load are the drifted copies. Use one RESOURCE_RETRY_MS default; 15s matches useSystemName and type names, while the codex moves from 10s to 15s. Preserve the codex `failed` semantics: true from the first failure until a success, not reset while a retry is in flight, so 'Effect details are unavailable right now' does not flicker to 'Loading effects…'. Preserve the no-retry in-flight-only behaviour of wh-statics and the per-id cache of names-client. Preserve useSystemName's gate (load only when systemId !== null) and useStations' gate (only once the list was opened, typed in or scoped to stations) through `enabled`. Error-message format becomes `${label} ${kind}[ ${status}]`; the old systems/stations/blueprints/statics/names format printed only the status. The hydration fix is a side benefit: the store's serverValue replaces the useState(getLoadedSystems) seeding. The finder's settled claims check out: the blueprints and systems .catch resets are live (the throw inside .then rejects), and stations' reset inside .then is equivalent because apiFetch never rejects.

<sub>Reported by: area:components-composition, area:data-eve, area:industry-planner, area:mapper-chain, area:mapper-signatures, area:mapper-surface, concern:client-hooks, concern:generic-utils, dupes-triage-1, dupes-triage-2.</sub>

<a id="p065"></a>

## P065: Rebuild useSlotsLive on useLiveDataset with skill-eligible coldness, promote readWithRetries and the latest-wins read to src/lib, and add useRememberedResource for the three remembered per-identity reads

- **Status:** [ ] not started
- **Category:** client-data · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** medium · **Payoff:** medium · **Size:** About -90 lines (use-slots-live 64→~25; use-account-characters effect 24→~10; use-available-structures effect 10→2; eve-status loop 6→1), about +40 (useRememberedResource, eligibility threading); three files move
- **Depends on:** [P140](wave-03-src-lib-primitives-collections-math-async.md#p140), [P068](wave-09-auth-routes-and-the-mutation-transport-pipeline.md#p068), [P154](wave-01-quick-wins-delete-dead-code-fix-small.md#p154)
- **Existing primitive:** `src/components/use-live-dataset.ts:useLiveDataset; src/components/remembered-read.ts:createRememberedRead,useRememberedRead; src/features/industry-planner/use-resource-read.ts:useResourceRead`

**Problem.** useLiveDataset is the canonical remembered-read live hook: identity guard, reconcile schedule, failed/retry. useSlotsLive re-implements it and has drifted. It polls every 5s for 24 attempts while any linked character has synced:false, including pilots without skill scopes, who never sync. Each poll fires an after(refreshSkillsOnView) write-behind. Failures retry silently and then settle to an empty list that looks the same as 'no characters', and the hook exposes neither failed nor retry. The generic planner primitives createResourceRead, useResourceRead and readWithRetries live in features/industry-planner, so code outside the feature hand-rolls them. data/eve-status writes its own retry loop with identical semantics. use-account-characters writes its own ignore flag, AbortController and an unreachable .catch. Inside the planner, useAvailableStructures inlines useResourceRead's effect. The remembered-read, read-identity and abortable-read trio is assembled by hand in three places.

**Verifier revision.** Three parts survive, and two cited sites do not fit. (A) useSlotsLive is a hand-rolled useLiveDataset with real drift. Its coldness test `characters.some(c => !c.synced)` counts pilots who can never sync: the route reports synced:false whenever levels are null (route.ts:40). It runs 24 polls at 5s, and each poll triggers after(refreshSkillsOnView) (skills-sync.ts:51). Failures settle to an empty list with no failed/retry, and its `.catch(() => null)` is dead. One claim in P050 is wrong: ProfileWorkspace does not already derive skill-eligible ids. Eligibility must be threaded from the server, the way jobIds and corpIds are (industry-characters.ts:29-41,56-57). (B) readWithRetries has a real outside consumer: eve-status's loop (queries.ts:38-43) has exactly its semantics (null means retry, pauses [300, 900], a non-null 'offline' result stops). (C) createResourceRead and useResourceRead are stranded in the planner, while useAccountCharacters in the components zone hand-rolls the same latest-wins abortable read. The same 'remembered read refreshed per identity' trio appears in useAvailableStructures and in the usePlannerProfile levels read. Rejected sub-sites: use-system-search's suggest abort returns results to its caller (no onData or generation), and build-system-apply returns applied/failed/superseded and chains an outer signal. Both have different contracts.

**Sites (20).**

- [`src/features/industry-jobs/use-slots-live.ts:10-64`](../../src/features/industry-jobs/use-slots-live.ts#L10-L64) — hand-rolled remembered read: fixed 5s×24 schedule, coldness over all characters, dead .catch(() => null) at 31, settles failures to { characters: [] }
- [`src/components/use-live-dataset.ts:35-115`](../../src/components/use-live-dataset.ts#L35-L115) — canonical hook; memory per endpoint.path; one retry then failed; reconcileSchedule parameter
- [`src/lib/live-dataset.ts:1-39`](../../src/lib/live-dataset.ts#L1-L39) — eligibleIdsKey, anyEligibleCold, reconcileDelay, loadFailureStep
- [`src/features/industry-jobs/use-jobs-live.ts:9-20`](../../src/features/industry-jobs/use-jobs-live.ts#L9-L20) — sibling that scopes coldness to eligible ids
- [`src/components/composition/board/use-board-live.ts:7-13`](../../src/components/composition/board/use-board-live.ts#L7-L13) — precedent for a bounded backoff reconcile schedule
- [`src/app/api/account/industry-slots/route.ts:26-44`](../../src/app/api/account/industry-slots/route.ts#L26-L44) — synced = levels !== null for every linked character, eligible or not
- [`src/composition/sync/skills-sync.ts:48-57`](../../src/composition/sync/skills-sync.ts#L48-L57) — every slots read schedules after(refreshSkillsOnView)
- [`src/features/skill-queue/sync-eligibility.ts:6-12`](../../src/features/skill-queue/sync-eligibility.ts#L6-L12) — canSyncSkillQueue, the eligibility test to thread
- [`src/app/(site)/industry/industry-characters.ts:14-21, 29-41, 48-59, 73-82`](../../src/app/%28site%29/industry/industry-characters.ts#L14-L21) — server-side eligibleIds for jobs/corp; skillIds is missing
- [`src/app/(site)/industry/IndustryLanding.tsx:12-31`](../../src/app/%28site%29/industry/IndustryLanding.tsx#L12-L31) — passes job/corp ids; would pass skill ids
- [`src/components/composition/industry-workspace/ProfileWorkspace.tsx:63-85`](../../src/components/composition/industry-workspace/ProfileWorkspace.tsx#L63-L85) — useCapacities: only consumer of useSlotsLive; reads slots.characters only
- [`src/transport/api-client.ts:28-47`](../../src/transport/api-client.ts#L28-L47) — apiFetch maps fetch and decode errors to networkFailure and never rejects
- [`src/features/industry-planner/read-with-retries.ts:1-31`](../../src/features/industry-planner/read-with-retries.ts#L1-L31) — generic; imports nothing
- [`src/data/eve-status/queries.ts:11, 34-47`](../../src/data/eve-status/queries.ts#L11) — hand-rolled retry loop with readWithRetries semantics; readServerStatus never throws
- [`src/features/industry-planner/resource-read.ts:1-36`](../../src/features/industry-planner/resource-read.ts#L1-L36) — generic latest-wins abortable read; imports nothing
- [`src/features/industry-planner/use-resource-read.ts:1-17`](../../src/features/industry-planner/use-resource-read.ts#L1-L17) — generic effect wrapper
- [`src/features/industry-planner/use-available-structures.ts:27-41`](../../src/features/industry-planner/use-available-structures.ts#L27-L41) — remembered read + identity + inline createResourceRead + revision key
- [`src/features/industry-planner/components/use-planner-profile.ts:35-60`](../../src/features/industry-planner/components/use-planner-profile.ts#L35-L60) — remembered read + identity + useCallback onData + useResourceRead
- [`src/components/use-account-characters.ts:20-49`](../../src/components/use-account-characters.ts#L20-L49) — remembered read + identity + hand-rolled ignore/AbortController + unreachable .catch; keep-roster-on-failure rule
- [`src/components/remembered-read.ts:19-44`](../../src/components/remembered-read.ts#L19-L44) — home for useRememberedResource

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/use-system-search.ts:78-91`](../../src/components/use-system-search.ts#L78-L91) — Abort-previous for a call whose results are returned to the caller; no onData or generation guard, so createResourceRead's fire-and-forget shape does not fit
- [`src/features/industry-planner/build-system-apply.ts:19-47`](../../src/features/industry-planner/build-system-apply.ts#L19-L47) — Returns applied/failed/superseded to its caller and links an outer AbortSignal; a different contract guarded by build-system-apply.test.ts, so leave it
- [`src/platform/search/index.ts:64-80`](../../src/platform/search/index.ts#L64-L80) — platform/search may import nothing

</details>

**Home.** `(A) src/features/industry-jobs/use-slots-live.ts, rebuilt on src/components/use-live-dataset.ts. (B) src/lib/read-with-retries.ts, moved. (C) src/lib/resource-read.ts and src/lib/use-resource-read.ts, moved, plus useRememberedResource added to src/components/remembered-read.ts.`

**Boundary check.** (A) features → components and lib are allowed (`from features allow [..., lib, config, ui, components]`). app → features is allowed for industry-characters.ts importing features/skill-queue/sync-eligibility. app → components-composition is allowed for passing the prop. (B, C) lib (`from lib allow [config]`): the three files import nothing but react, matching lib's existing hooks. Consumers: data/eve-status (`from data allow [... lib ...]`), features/industry-planner (`allow lib`), and components/remembered-read.ts (`from components allow [..., platform/auth, ..., lib]`). useRememberedResource in components is importable by features (`allow components`) and by components itself. It must not go in lib, because it needs platform/auth/read-identity, which lib may not import.

**API sketch.**

```ts
// features/industry-jobs/use-slots-live.ts
const SLOTS_RECONCILE: readonly number[] = [4_000, 8_000, 15_000, 30_000, 60_000];
function slotsIsCold(r: IndustrySlotsResponse, key: string): boolean // anyEligibleCold(r.characters.map(c => ({ characterId: c.characterId, data: c.levels })), key)
export function useSlotsLive(eligibleCharacterIds: number[]): { characters: ViewerSlots[]; loading: boolean; failed: boolean; retry: () => void }

// lib/read-with-retries.ts (unchanged signature)
export function readWithRetries<T>(read: () => Promise<T | null>, signal?: AbortSignal, delays?: readonly number[]): Promise<T | null>
// lib/resource-read.ts, lib/use-resource-read.ts (unchanged signatures)

// components/remembered-read.ts
export function useRememberedResource<T>(
  memory: RememberedRead<T>,
  read: (signal: AbortSignal) => Promise<T | null>, // stable reference; null = keep what is drawn
  opts?: { enabled?: boolean; refreshKey?: number },
): T | null // useRememberedRead + useReadIdentity + useResourceRead(read, { enabled: identity !== null && enabled, onData: next => memory.set(next, identity), refreshKey })
```

**Migration steps.**

1. A1. In industry-characters.ts, add `skillIds: eligibleIds(linked, canSyncSkillQueue)` to IndustryCharacters, return it from jobCharacterIds (with [] in the catch), and pass it from page.tsx:26-28 → IndustryLanding (new prop) → ProfileWorkspace → ProfileWorkspaceBody → useCapacities(…, skillIds).
2. A2. Rewrite use-slots-live.ts as `useLiveDataset(industrySlotsEndpoint, eligibleKey, slotsIsCold, SLOTS_RECONCILE)`, with eligibleKey = useMemo(eligibleIdsKey) and module-level slotsIsCold and SLOTS_RECONCILE. Return `characters: response?.characters ?? NO_SLOTS`, using a module const so useCapacities' memo deps stay stable, plus loading/failed/retry. Delete slotsMemory, anyUnsynced and the dead catch.
3. A3. Rewrite use-slots-live.test.ts for the new semantics: identity guard, a remembered answer kept on failure, one retry then failed, coldness only for eligible ids, and the schedule cap. Its react mock needs useState/useCallback/useMemo, or it can use the use-live-dataset.test.ts harness.
4. B1. Move read-with-retries.ts and its test to src/lib. Update importers (use-planner-location-writes.ts, use-component-fee-sources.ts, use-industry-profiles.ts) and the vi.mock('../read-with-retries') paths in use-planner-profile.test, use-component-fee-sources.test and use-planner-location-writes.test.
5. B2. eve-status/queries.ts:38-43: `const status = (await readWithRetries(readServerStatus, undefined, STATUS_RETRY_DELAYS_MS)) ?? { state: 'unknown' }`.
6. C1. Move resource-read.ts and use-resource-read.ts with resource-read.test.ts to src/lib. Update the importers PricingProvider, use-component-fee-sources, use-planner-location-writes and use-planner-profile, and the vi.mock('../use-resource-read') paths in PricingProvider.test, use-component-fee-sources.test and use-planner-profile.test. Fallow coverage-gaps requires a test for src/lib/use-resource-read.ts, so add one, or cover it via the useRememberedResource test.
7. C2. Add useRememberedResource to src/components/remembered-read.ts, with tests in remembered-read.test.ts.
8. C3. useAvailableStructures becomes `useRememberedResource(structuresMemory, readAvailableStructures, { refreshKey: useClientStore(structuresRevision) })`. Delete the inline effect (31-39).
9. C4. usePlannerProfile: `const levels = useRememberedResource(levelsMemory, readTeamSkillLevels, { enabled: profile !== null }) ?? NO_LEVELS`. Delete rememberLevels and the direct useResourceRead (56-60).
10. C5. useAccountCharacters: build a `read` with useCallback([characterId]). It returns `{ characterId, list }` on ok. On failure it returns null when rosterMemory already holds this characterId's roster (keep drawn), otherwise `{ characterId, list: [] }` (a first failure settles empty). Call `useRememberedResource(rosterMemory, read, { enabled: characterId !== null })` and delete the hand-rolled effect (26-46).

**Tests.** Existing guards: use-live-dataset.test.ts and live-dataset.test.ts (unchanged), resource-read.test.ts and read-with-retries.test.ts (moved with their files), remembered-read.test.ts (extend), use-account-characters.test.ts and use-slots-live.test.ts (rewrite as noted). Add to use-slots-live.test.ts: an ineligible never-synced pilot causes no reconcile fetch, and an eligible cold pilot follows SLOTS_RECONCILE then stops. Add for eve-status a test that a 503 maps to offline with no retry and that two nulls then a status resolve after [300, 900]. use-account-characters.test.ts mocks react with only useSyncExternalStore/useEffect, so add a passthrough useCallback. Its 'rejected refresh' cases (78-115) model an impossible apiFetch rejection: re-express them as `{ ok: false, kind: 'network' }` outcomes. The createResourceRead path drops thrown reads without onData, so a literal rejection would no longer settle a first read to [].

**Notes.** Slots behaviour changes. Failure: currently 24 silent retries at 5s, then { characters: [] }; afterwards useLiveDataset's one retry at 4s, then failed. ProfileWorkspace reads only `characters`, so capacity display is identical (no levels either way), but the hook now reports failed/retry. Coldness: currently any synced:false; afterwards only skill-eligible pilots (canSyncSkillQueue), which stops polling and after(refreshSkillsOnView) for pilots lacking skill scopes. The schedule is a judgement call: the board's [4s, 8s, 15s, 30s, 60s] is the closest precedent, while Array(24).fill(5_000) preserves today's cadence for eligible pilots. useLiveDataset adds a 30s `now` tick; ProfileWorkspaceBody already has one from useBoardLive, so the cost is negligible. Preserve use-account-characters' rules: a failed refresh keeps the drawn roster for the same pilot, a first failure settles empty, a different pilot never sees another's roster (memory.set's identity guard plus the characterId check), and unmount aborts the request (createResourceRead.cancel aborts). Preserve eve-status's 503→offline mapping: readServerStatus returns non-null for it, so readWithRetries stops. Preserve `cache: 'no-store'` on all three reads (it is in each read function).

<sub>Reported by: area:features-owned, area:industry-planner, area:ui-components, concern:client-hooks, concern:feature-skeleton.</sub>

<a id="p328"></a>

## P328: Make lazy search sources load only their search function

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** simplification · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -10 / +4
- **Depends on:** —
- **Existing primitive:** `src/platform/search/index.ts:registerLazySearchSource`

**Problem.** LazySearchSource.load returns a full SearchSource, so the lazily imported modules (systems-search.ts, blueprints-source.ts) carry a second copy of id, name, limit and excludeFromDefaultScope that the registry never reads. The authoritative metadata lives in the small eager meta objects (data/eve-data/search.ts and features/industry-planner/search.ts), so the two copies can drift without any effect or warning.

**Sites (10).**

- [`src/platform/search/index.ts:46-53`](../../src/platform/search/index.ts#L46-L53) — LazySearchSource.load: () => Promise<SearchSource>
- [`src/platform/search/index.ts:64-87`](../../src/platform/search/index.ts#L64-L87) — Metadata comes from meta; only resolved.search(query, ctx) is used at line 84
- [`src/data/eve-data/search.ts:3-9`](../../src/data/eve-data/search.ts#L3-L9) — Eager meta for systems (id, name, limit 10, excludeFromDefaultScope)
- [`src/data/eve-data/systems-search.ts:64-90`](../../src/data/eve-data/systems-search.ts#L64-L90) — systemsSource repeats id, name, limit and excludeFromDefaultScope
- [`src/features/industry-planner/search.ts:3-8`](../../src/features/industry-planner/search.ts#L3-L8) — Eager meta for blueprints (id, name, limit 6)
- [`src/features/industry-planner/blueprints-source.ts:30-57`](../../src/features/industry-planner/blueprints-source.ts#L30-L57) — blueprintsSource repeats id, name and limit
- [`src/composition/search/register-all.ts:11-14`](../../src/composition/search/register-all.ts#L11-L14) — The only two registerLazySearchSource calls
- [`src/platform/search/search.test.ts:182-290`](../../src/platform/search/search.test.ts#L182-L290) — Lazy-source tests whose load returns a full SearchSource; they need updating
- [`src/data/eve-data/systems-search.test.ts:61-110`](../../src/data/eve-data/systems-search.test.ts#L61-L110) — Calls m.systemsSource.search(...)
- [`src/features/industry-planner/blueprints-source.test.ts:16-30`](../../src/features/industry-planner/blueprints-source.test.ts#L16-L30) — Calls blueprintsSource.search(...)

**Home.** `src/platform/search/index.ts (change the existing LazySearchSource type and registerLazySearchSource)`

**Boundary check.** The type change stays inside platform/search, which imports nothing ({from: platform/search, allow: []}). data/eve-data already imports platform/search ({from: data, allow: [..., platform/search, ...]}). features/industry-planner already imports it ({from: features, allow: [..., platform/search, ...]}). composition/search already imports it ({from: composition, allow: [..., platform/search, ...]}). No new edges.

**API sketch.**

```ts
export type LazySearchSource = {
  id: string;
  name: string;
  limit?: number;
  showOnEmpty?: boolean;
  excludeFromDefaultScope?: boolean;
  load: () => Promise<SearchSource['search']>;
};

// systems-search.ts
export const searchSystems: SearchSource['search'] = async (query, ctx) => { ... };
// blueprints-source.ts
export const searchBlueprints: SearchSource['search'] = async (query, ctx) => { ... };
// data/eve-data/search.ts
load: () => import('./systems-search').then((m) => m.searchSystems),
```

**Migration steps.**

1. platform/search/index.ts: change LazySearchSource.load to return Promise<SearchSource['search']>. In registerLazySearchSource, type loadPromise as Promise<SearchSource['search']> | null, keep the retry-on-reject and post-await abort check, and call `(await loadPromise)(query, ctx)`.
2. systems-search.ts: replace the systemsSource object with `export const searchSystems: SearchSource['search'] = async (query, ctx) => {...}` holding the same body. Change data/eve-data/search.ts load to `.then((m) => m.searchSystems)`.
3. blueprints-source.ts: replace blueprintsSource with searchBlueprints in the same way. Change features/industry-planner/search.ts load to `.then((m) => m.searchBlueprints)`.
4. Update the tests: in search.test.ts, have the lazy-case load mocks resolve to a search function (for example `vi.fn(async () => realSource.search)` or `async () => realSearch`). In systems-search.test.ts and blueprints-source.test.ts, call searchSystems(...) and searchBlueprints(...) directly.

**Tests.** Existing guards: search.test.ts 'registerLazySearchSource' block (load once, no load on an empty query, retry after a reject, pre-aborted signal), systems-search.test.ts 'systemsSource' block and blueprints-source.test.ts. All are kept with updated call shapes. Fallow unused-exports confirms that systemsSource and blueprintsSource are fully removed.

**Notes.** Behaviour is unchanged: the registry already ignored the loaded metadata. Keep the code-split boundary. The eager meta modules must still import only types from platform/search, and the dynamic import() stays the only reference to the loaded module. The loaded copies and the meta values agree today, so there is no drift bug to choose between.

<sub>Reported by: area:data-eve.</sub>

<a id="p069"></a>

## P069: Send every search source through rankFuzzyResults (with a tie-break), declare lazy-source metadata once, and share the all-words name match

- **Status:** [ ] not started
- **Category:** client-data · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -45 net (recents -12, sites -15, the duplicate meta in each lazy source -8, the two search bodies replaced by about 6 helper lines -18, nameMatches -7; plus about 20 added for the helper, the tieBreak and matchesAllWords)
- **Depends on:** [P328](#p328)
- **Existing primitive:** `src/platform/search/rank.ts:rankFuzzyResults`

**Problem.** rankFuzzyResults (match, sort by score, cap, map) is the shared ranker, but two of the six sources hand-roll it: recents copies it exactly, and sites copies it to add a class-then-ISK tie-break the ranker cannot express. The two lazy sources declare id/name/limit/excludeFromDefaultScope in the LazySearchSource meta and again on the SearchSource their load() resolves to, and registerLazySearchSource ignores the second copy. systemsSource.search and blueprintsSource.search are the same function with a different loader and mapper, plus a magic MAX_RESULTS=20 that disagrees with the real limits of 6 and 10. The facility dropdown tests 'every typed word appears in the lowercase name' twice: nameMatches for structures and matchStations for NPC stations.

**Verifier revision.** The core holds. search-recents (L9-23) is rankFuzzyResults without a limit, and its empty-query branch is redundant: fuzzyMatch('') returns {score:0, matchIndices:[]} (match.ts L9-11) and Array.prototype.sort is stable, so recency order is kept. scope-equivalence.test.ts L105 guards that. wormhole-sites/search reimplements the ranker only for its class/ISK tie-break. The lazy-source meta really is declared twice for blueprints and systems; the values agree today, but only `resolved.search` is read (index.ts L84). The systemsSource and blueprintsSource bodies are a fallow near-duplicate group (dupes-grouped c77b3abb6f87acd9-733), and their loaders form another (-1574). Two parts of the proposal change. (1) MAX_RESULTS=20 does have an effect: it caps how many results get mapped. That cap is never visible through searchAll/searchOneSource, though, which slice to the meta limit of 6 or 10. Delete it rather than keep a third limit number. (2) The TOOLS alias hrefs are real drift but unrelated to the search primitive, so they move to a separate trailing step. That step also covers the dead alsoMatches entry and a '/structures' link in settings that the finder missed. matchesAllWords is confirmed: two copies of the same all-words test feed one dropdown.

**Sites (14).**

- [`src/platform/search/rank.ts:4-19`](../../src/platform/search/rank.ts#L4-L19) — rankFuzzyResults; opts has only limit
- [`src/platform/search/match.ts:8-18`](../../src/platform/search/match.ts#L8-L18) — fuzzyMatch scores an empty query as 0 with no indices
- [`src/features/search-recents/search.ts:9-23`](../../src/features/search-recents/search.ts#L9-L23) — hand-rolled ranker; the empty branch at L10-12 is redundant
- [`src/features/wormhole-sites/search.ts:35-59`](../../src/features/wormhole-sites/search.ts#L35-L59) — hand-rolled ranker plus tie-break: CLASS_ORDER (unknown and null = 9), then primarySiteIsk descending
- [`src/platform/search/index.ts:46-53, 64-87`](../../src/platform/search/index.ts#L46-L53) — LazySearchSource meta; registerLazySearchSource uses only resolved.search (L84)
- [`src/features/industry-planner/search.ts:3-8`](../../src/features/industry-planner/search.ts#L3-L8) — blueprints meta copy 1 (limit 6)
- [`src/features/industry-planner/blueprints-source.ts:8, 10-28, 30-56`](../../src/features/industry-planner/blueprints-source.ts#L8) — MAX_RESULTS=20, cached index loader, meta copy 2 (limit 6), search body
- [`src/data/eve-data/search.ts:3-9`](../../src/data/eve-data/search.ts#L3-L9) — systems meta copy 1 (limit 10, excludeFromDefaultScope)
- [`src/data/eve-data/systems-search.ts:14, 19-36, 64-90`](../../src/data/eve-data/systems-search.ts#L14) — MAX_RESULTS=20, cached loader, meta copy 2, search body identical in shape to blueprints
- [`src/data/eve-data/stations-search.ts:28-42`](../../src/data/eve-data/stations-search.ts#L28-L42) — matchStations: all-words filter, then prefix-first sort
- [`src/components/composition/industry-workspace/facilities-model.ts:120-126, 140-142`](../../src/components/composition/industry-workspace/facilities-model.ts#L120-L126) — nameMatches: the same all-words test, applied to structures in the same dropdown
- [`src/data/tools/registry.ts:26, 36-51`](../../src/data/tools/registry.ts#L26) — Industry Jobs / Structures hrefs and matchPrefix use the redirect aliases '/jobs' and '/structures'; Industry Planner's alsoMatches lists both aliases (dead: next.config redirects them before any page renders)
- [`next.config.ts:54-63`](../../next.config.ts#L54-L63) — '/jobs' redirects to '/industry/jobs'; '/structures' redirects to '/industry?panel=structures'
- [`src/app/(site)/settings/corporations/page.tsx:66`](../../src/app/%28site%29/settings/corporations/page.tsx#L66) — another link to the '/structures' alias

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/tools/search.ts:5-27`](../../src/data/tools/search.ts#L5-L27) — already uses rankFuzzyResults
- [`src/composition/search/commands-source.ts:104-127`](../../src/composition/search/commands-source.ts#L104-L127) — already uses rankFuzzyResults
- [`src/data/eve-data/systems-search.ts:46-62`](../../src/data/eve-data/systems-search.ts#L46-L62) — matchSystem is a typed-name resolver (exact, then prefix, then score, then alphabetical) that returns one system, not a ranked list. Different concept
- [`src/features/industry-jobs/page-settings.ts:3-4`](../../src/features/industry-jobs/page-settings.ts#L3-L4) — evidence for the canonical route only. data/tools cannot import features, so TOOLS keeps a literal

</details>

**Home.** `src/platform/search/rank.ts (tieBreak, indexedFuzzySearch); src/platform/search/match.ts (matchesAllWords); src/platform/search/index.ts (LazySearchSource.load type)`

**Boundary check.** platform/search's rule allows nothing. rank.ts and match.ts import only each other, '.', and fuzzysort. The new helper takes its loader as a parameter, so it adds no imports. Consumers: features/search-recents, features/wormhole-sites and features/industry-planner (the features rule allows platform/search); data/eve-data (the data rule allows platform/search); components-composition facilities-model.ts (that rule allows platform/search). Every one of these files already imports from @/platform/search.

**API sketch.**

```ts
rankFuzzyResults<T>(items, query, getLabel, toResult, opts?: { limit?: number; tieBreak?: (a: T, b: T) => number }): SearchResult[]  // sort: b.score - a.score || tieBreak?.(a.item, b.item) || 0
indexedFuzzySearch<T>(opts: { load: () => Promise<readonly T[]>; label: (t: T) => string; toResult: (t: T, m: FuzzyMatch) => SearchResult }): SearchSource['search']  // '' -> [] without loading; aborted after load -> []
LazySearchSource = Omit<SearchSource, 'search'> & { load: () => Promise<SearchSource['search']> }
matchesAllWords(name: string, query: string): boolean  // query trimmed+lowercased, split on whitespace, empty words dropped; every word in name.toLowerCase()
```

**Migration steps.**

1. rank.ts: add opts.tieBreak and make the comparator `b.match.score - a.match.score || (opts?.tieBreak?.(a.item, b.item) ?? 0)`. Add rank.test.ts cases: equal scores are ordered by tieBreak; without tieBreak the input order is kept.
2. search-recents/search.ts: replace the body with `return rankFuzzyResults(ctx.recents, query, (r) => r.label, (r, m) => ({ ...r, matchIndices: m.matchIndices }));` and delete the empty-query branch.
3. wormhole-sites/search.ts: replace L36-59 with rankFuzzyResults(SITE_INDEX, query, (e) => e.name, toResult, { tieBreak: (a, b) => classRank(a) - classRank(b) || (primarySiteIsk(b) ?? 0) - (primarySiteIsk(a) ?? 0) }). Keep CLASS_ORDER and the `?? 9` fallback for null and unknown classes.
4. rank.ts: add indexedFuzzySearch with no limit. searchAll already slices to the meta limit, and mapping N results costs the same order as fuzzy-matching N entries.
5. index.ts: retype LazySearchSource as `Omit<SearchSource,'search'> & { load: () => Promise<SearchSource['search']> }`. In registerLazySearchSource, cache a Promise<SearchSource['search']> and call `resolved(query, ctx)`. Update search.test.ts L280-283 to `load: async () => realSearch`.
6. blueprints-source.ts: replace the blueprintsSource object and MAX_RESULTS with `export const searchBlueprints = indexedFuzzySearch({ load: loadIndex, label: (e) => e.name, toResult: ... })`. Change industry-planner/search.ts to `load: () => import('./blueprints-source').then((m) => m.searchBlueprints)`.
7. systems-search.ts: do the same, producing `export const searchSystems = indexedFuzzySearch({ load: loadSystems, ... })` and deleting MAX_RESULTS and systemsSource. Point data/eve-data/search.ts load at m.searchSystems. Keep loadSystems/getLoadedSystems exported for use-system-search.
8. Update systems-search.test.ts (L61-111 call m.systemsSource.search) and blueprints-source.test.ts (L20) to call the exported search functions. Their assertions (empty query does not fetch; the fetch is memoized; an abort returns []) now exercise indexedFuzzySearch.
9. match.ts: add matchesAllWords. In stations-search.matchStations, filter with `matchesAllWords(s.name, query)` and keep the `words.length === 0` early return and the prefix-first sort. In facilities-model.ts, delete nameMatches (L120-126) and call matchesAllWords at L141.
10. Separate small fix: in registry.ts set Industry Jobs to href/matchPrefix '/industry/jobs' and Structures to href '/industry?panel=structures' (matchPrefix can stay '/structures' or be dropped, since the item is navHidden). Drop the dead alsoMatches ['/jobs','/structures'] on Industry Planner, because '/industry' already prefixes '/industry/jobs'. Update registry.test.ts L19-20 and the inline snapshot in scope-equivalence.test.ts L255. Point settings/corporations/page.tsx L66 at the canonical route.

**Tests.** Existing guards: rank.test.ts (score order, limit); wormhole-sites/search.test.ts L33 (tie-break C1 to C6, then ISK descending; must stay green unchanged); scope-equivalence.test.ts L105 (recents in recency order on an empty query) plus its section-order assertions L373/L430; search.test.ts L182-292 (lazy-load retry after failure, abort after load); systems-search.test.ts L61-111; blueprints-source.test.ts; facilities-model.test.ts L81-100 (typed query filters structures and stations). Add: rank.test.ts tieBreak, and indexedFuzzySearch (no load on ''; [] when aborted after load; a load rejection propagates so registerLazySearchSource can retry); match.test.ts matchesAllWords (word order, case, extra whitespace).

**Notes.** Behaviour to preserve. (1) The sites tie-break treats null and unknown classes as rank 9 and orders by primarySiteIsk descending with null as 0. (2) The all-words match never runs on an empty query: matchStations returns [] for zero words, and facilityOptionGroups skips nameMatches when query === ''. Keep both call-site conditions, because matchesAllWords('x','') would be vacuously true. (3) matchStations' prefix-first sort is station-specific and stays local. (4) The three cached index loaders (blueprints loadIndex, systems loadSystems, stations loadStations) are also near-identical, but they belong to the separate client-resource opportunity. Note that loadStations resets indexPromise only on a non-ok outcome. That is safe because apiFetch never rejects (transport/api-client.ts L35-46). No drift was found between the duplicated meta copies today; the refactor removes the possibility.

<sub>Reported by: area:features-sites-misc, area:platform, concern:feature-skeleton, concern:generic-utils.</sub>

<a id="p276"></a>

## P276: Replace the page-settings and search side-effect registries with static arrays passed explicitly

- **Status:** [ ] not started
- **Category:** feature-skeleton · **Kind:** simplification · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** prod about −80/+30 (platform/page-settings/index.ts −20, page-settings register-all −6, search registry functions about −45 replaced by a lazySearchSource factory of about +20, data/eve-data/search.ts −9, two side-effect imports −2, resolvePageSettings +3, SEARCH_SOURCES +7); tests net about −60 (scoping suite and engine test removed, register calls become array literals)
- **Depends on:** [P123](wave-07-ui-kit-primitives-src-components-ui.md#p123), [P328](#p328), [P069](#p069)
- **Existing primitive:** `src/platform/page-settings/resolve.ts:resolveSpecForPath`

**Problem.** Page settings: PAGE_SETTINGS_SPECS is a static array that the preferences page already reads directly. register-all.ts pushes the same specs into a mutable module array in src/platform/page-settings/index.ts, only so that PageMenuProvider can call resolvePageSettings(p), which is resolveSpecForPath(p, specs). listPageSettings, registerPageSettings and __resetPageSettings have no production caller besides register-all.

Search: sources live in a mutable array in src/platform/search/index.ts, filled by a side-effect import that appears twice (AppHeaderShell and MapChrome). BlueprintSearch and useSystemSearch look their source up by string id through searchOneSource, so they only work because an unrelated header or chrome module is in the bundle graph. MapChrome.test pins that workaround. Id scoping and excludeFromDefaultScope exist only so these two callers can reach one source, and systems is in the global list only to be excluded from it. Tests rebuild the registry by hand: search.test has about 60 register calls, and commands-source.test registers a source just to read it back by name.

**Verifier revision.** The core claim holds. Both registries are mutable singletons filled by a side-effect import. Their only callers are one production lookup each, plus tests that use register and reset as a seam. The repo already has the target pattern: src/composition/purge/register-all.ts exports a static PURGE_CONTRIBUTORS array that callers import. However, 'results depend on mount order' overstates it, and there is no live bug. Every route that renders BlueprintSearch or useSystemSearch sits under (site)/layout.tsx, then SiteFrame, AppHeader and AppHeaderShell, and AppHeaderShell imports register-all. MapChrome also carries a second, defensive side-effect import, and a test pins it. The coupling is hidden and fragile, but it is satisfied today. The finders missed these sites: the MapChrome import and its test, GlobalSearch, commands-source.test, PageMenuProvider.test, PageMenuSection.test, the two LazySearchSource meta modules, and a drift bug in StructureComposer. The design also changes. The proposal had searchAll take sources while keeping id scoping. Instead, id scoping and excludeFromDefaultScope should go, because searchOneSource is their only production use. searchOneSource should take a source object, and useSystemSearch should call the eager systemsSource from systems-search.ts, a module it already imports statically.

**Sites (24).**

- [`src/platform/page-settings/index.ts:1-20`](../../src/platform/page-settings/index.ts#L1-L20) — Mutable specs array with register, list, resolve and reset. resolvePageSettings is resolveSpecForPath over that array.
- [`src/composition/page-settings/register-all.ts:1-6`](../../src/composition/page-settings/register-all.ts#L1-L6) — Side-effect loop that pushes PAGE_SETTINGS_SPECS into the registry.
- [`src/composition/page-settings/specs.ts:1-12`](../../src/composition/page-settings/specs.ts#L1-L12) — Static PAGE_SETTINGS_SPECS, the only real source of truth.
- [`src/components/composition/PageMenuProvider.tsx:6-9,17-35`](../../src/components/composition/PageMenuProvider.tsx#L6-L9) — Side-effect import plus two resolvePageSettings calls. This is the only production consumer of the registry.
- [`src/app/(site)/settings/preferences/page.tsx:4,24`](../../src/app/%28site%29/settings/preferences/page.tsx#L4) — Already reads PAGE_SETTINGS_SPECS directly.
- [`src/composition/page-settings/registry.test.ts:13-28,52,61,77`](../../src/composition/page-settings/registry.test.ts#L13-L28) — Tests the mutable engine itself, then re-registers the real specs by hand before each resolve.
- [`src/components/composition/PageMenuProvider.test.ts:8,24-48`](../../src/components/composition/PageMenuProvider.test.ts#L8) — Uses reset and register as a fixture seam.
- [`src/components/composition/PageMenuSection.test.ts:9,17-79`](../../src/components/composition/PageMenuSection.test.ts#L9) — Same fixture seam.
- [`src/platform/search/index.ts:37-150`](../../src/platform/search/index.ts#L37-L150) — excludeFromDefaultScope, the mutable sources array, registerSearchSource with a duplicate-id console.error, registerLazySearchSource, listRegisteredSources, searchAll with id scoping, searchOneSource by id, and __resetSearchSources.
- [`src/composition/search/register-all.ts:1-14`](../../src/composition/search/register-all.ts#L1-L14) — Side-effect registration of six sources in a fixed order.
- [`src/components/composition/AppHeaderShell.tsx:10`](../../src/components/composition/AppHeaderShell.tsx#L10) — Side-effect import. This is what actually makes searchOneSource work on every (site) route.
- [`src/components/composition/map/MapChrome.tsx:10`](../../src/components/composition/map/MapChrome.tsx#L10) — Missed by the finders: a duplicate defensive side-effect import.
- [`src/components/composition/map/MapChrome.test.ts:5,92-96`](../../src/components/composition/map/MapChrome.test.ts#L5) — Missed by the finders: pins the side effect with the test 'registers the systems search source so atlas pickers can suggest'.
- [`src/components/composition/GlobalSearch.tsx:44-58`](../../src/components/composition/GlobalSearch.tsx#L44-L58) — Missed by the finders: the only searchAll caller in production, and it never passes source ids.
- [`src/components/use-system-search.ts:4-5,78-91`](../../src/components/use-system-search.ts#L4-L5) — Statically imports data/eve-data/systems-search already, yet reaches systemsSource indirectly through searchOneSource(input, 'systems').
- [`src/data/eve-data/systems-search.ts:64-90`](../../src/data/eve-data/systems-search.ts#L64-L90) — Eager systemsSource (limit 10, excludeFromDefaultScope). Identical to the lazy meta.
- [`src/data/eve-data/search.ts:1-9`](../../src/data/eve-data/search.ts#L1-L9) — Lazy meta for systems. It becomes dead once useSystemSearch uses systemsSource directly.
- [`src/features/industry-planner/components/BlueprintSearch.tsx:8-19`](../../src/features/industry-planner/components/BlueprintSearch.tsx#L8-L19) — Calls searchOneSource(query, 'blueprints', signal) by string id.
- [`src/features/industry-planner/search.ts:1-8`](../../src/features/industry-planner/search.ts#L1-L8) — Lazy meta for blueprints (limit 6).
- [`src/composition/search/commands-source.test.ts:2-7,18-45`](../../src/composition/search/commands-source.test.ts#L2-L7) — Missed by the finders: resets the registry and registers commandsSearchSource only to read it back with listRegisteredSources().find.
- [`src/composition/search/scope-equivalence.test.ts:23-24,377-470`](../../src/composition/search/scope-equivalence.test.ts#L23-L24) — Characterization over the real manifest, plus id-scoping and excluded-source tests that only exist because of the registry.
- [`src/platform/search/search.test.ts:1-425`](../../src/platform/search/search.test.ts#L1-L425) — About 60 registerSearchSource or registerLazySearchSource calls and __resetSearchSources in afterEach.
- [`src/composition/purge/register-all.ts:33`](../../src/composition/purge/register-all.ts#L33) — Existing precedent for a static contributor array, exported and imported explicitly.
- [`src/features/custom-structures/components/StructureComposer.tsx:93-108`](../../src/features/custom-structures/components/StructureComposer.tsx#L93-L108) — Drift bug: `void suggest(query).then(...)` has no rejection handler. useSystemSearch aborts the previous call, and searchAll then throws AbortError, so every superseded keystroke produces an unhandled rejection. TerminalSearch (terminal-search.tsx 50-64) handles this case correctly.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/platform/search/use-source-search.ts:9-37`](../../src/platform/search/use-source-search.ts#L9-L37) — A generic debounce and abort hook over any search function. It is unaffected and stays as is.
- [`src/platform/page-settings/resolve.ts:3-17`](../../src/platform/page-settings/resolve.ts#L3-L17) — The existing primitive, kept as is. The new resolvePageSettings delegates to it.

</details>

**Home.** `src/composition/page-settings/specs.ts (resolvePageSettings over PAGE_SETTINGS_SPECS); src/composition/search/register-all.ts (static SEARCH_SOURCES, mirroring composition/purge/register-all.ts); src/platform/search/index.ts (pure lazySearchSource factory, searchAll(sources, …), searchOneSource(query, source, signal))`

**Boundary check.** composition/page-settings/specs.ts is in the composition zone and imports platform/page-settings/resolve, which the composition rule allows. PageMenuProvider is in components-composition and imports composition, which its rule allows. The preferences page is in the app zone and imports composition, which the app rule allows (it already does). platform/search/index.ts keeps zero imports, as the platform/search rule ('allow': []) requires. composition/search/register-all.ts imports features, data, composition and platform/search, all allowed by the composition rule. GlobalSearch is in components-composition and imports composition and platform/search, both allowed. BlueprintSearch imports its own feature's search.ts (same zone) and platform/search, which the features rule allows. use-system-search is in the components zone and imports data (data/eve-data/systems-search) and platform/search, both allowed by the components rule. systems-search.ts is in the data zone and imports platform/search types, which the data rule allows.

**API sketch.**

```ts
// src/platform/search/index.ts
export function lazySearchSource(meta: LazySearchSource): SearchSource; // same memoised load, retry-on-reject and post-load abort check as registerLazySearchSource
export function searchAll(sources: readonly SearchSource[], query: string, ctx: SearchContext): Promise<SearchSection[]>;
export function searchOneSource(query: string, source: SearchSource, signal: AbortSignal): Promise<SearchResult[]>;
// SearchSource and LazySearchSource lose excludeFromDefaultScope; searchAll loses sourceIds

// src/composition/search/register-all.ts
export const SEARCH_SOURCES: readonly SearchSource[] = [recentsSearchSource, sitesSearchSource, blueprintsSearchSource, toolsSearchSource, commandsSearchSource];

// src/features/industry-planner/search.ts
export const blueprintsSearchSource: SearchSource = lazySearchSource({ id: 'blueprints', name: 'Blueprints', limit: 6, load: () => import('./blueprints-source').then((m) => m.blueprintsSource) });

// src/composition/page-settings/specs.ts
export function resolvePageSettings(pathname: string): PageSettingsSpec | null { return resolveSpecForPath(pathname, PAGE_SETTINGS_SPECS); }
```

**Migration steps.**

1. Per AGENTS.md, get a docs-researcher brief on Vitest module mocking before rewriting the tests.
2. Page settings first; it is independent of search. Add resolvePageSettings to src/composition/page-settings/specs.ts, delegating to resolveSpecForPath.
3. In PageMenuProvider.tsx, import resolvePageSettings from '@/composition/page-settings/specs' and delete the side-effect import on line 9.
4. Rewrite PageMenuProvider.test.ts and PageMenuSection.test.ts. Assert against the real specs where they cover the case: /sites with sites.view and sites.detailMode, /atlas with 'Map settings' and cameraFollow, /industry/jobs with strip 'jobs'. For synthetic cases such as the 'Sites' title, use vi.mock('@/composition/page-settings/specs', () => ({ resolvePageSettings: (p) => resolveSpecForPath(p, fixtures) })) with a vi.hoisted fixtures array.
5. In registry.test.ts, drop beforeEach(__resetPageSettings), the 'page-settings engine' test (resolve.test.ts already covers resolveSpecForPath) and the three `for … registerPageSettings` loops. Import resolvePageSettings from specs and keep every anti-drift test.
6. Delete src/platform/page-settings/index.ts and src/composition/page-settings/register-all.ts.
7. Search: in src/platform/search/index.ts, turn registerLazySearchSource into the pure lazySearchSource factory with the same body. Change searchAll to take a sources array as its first parameter, and drop sourceIds and the excludeFromDefaultScope filter. Reimplement searchOneSource as `(await searchAll([source], query, { session: null, isAdmin: false, recents: [], signal }))[0]?.results ?? []`. Delete the sources array, registerSearchSource, listRegisteredSources and __resetSearchSources, and remove excludeFromDefaultScope from both types.
8. In features/industry-planner/search.ts, export blueprintsSearchSource as lazySearchSource({...}).
9. Rewrite composition/search/register-all.ts as `export const SEARCH_SOURCES = [recents, sites, blueprints, tools, commands]`. Keep the current order (scope-equivalence pins it) and drop systems.
10. In GlobalSearch.tsx, call searchAll(SEARCH_SOURCES, debounced, ctx). Delete the side-effect imports at AppHeaderShell.tsx:10 and MapChrome.tsx:10, and the test at MapChrome.test.ts:92-96 along with its import on line 5.
11. In BlueprintSearch.tsx, use searchOneSource(query, blueprintsSearchSource, signal).
12. In use-system-search.ts, import systemsSource from the systems-search module it already imports, and call searchOneSource(input, systemsSource, ctrl.signal). Remove excludeFromDefaultScope from systemsSource and delete src/data/eve-data/search.ts, which would otherwise be an unused file.
13. Fix the drift in StructureComposer.tsx:102: add a rejection handler that ignores AbortError, the way TerminalSearch does.
14. Tests: in search.test.ts, pass explicit arrays to searchAll and rename the registerLazySearchSource suite to lazySearchSource. Delete the 'searchAll scoping' suite, whose feature is removed, and rewrite the searchOneSource tests with source objects. In commands-source.test.ts, call commandsSearchSource.search directly. In scope-equivalence.test.ts, use searchAll(SEARCH_SOURCES, …), keep the full-scope characterization anchor, replace the manifest pin with SEARCH_SOURCES.map((s) => s.id) toEqual ['recents','sites','blueprints','tools','commands'] plus a uniqueness check (this replaces the runtime duplicate-id console.error), and move the 'jita' systems assertion to searchOneSource('jita', systemsSource, signal).
15. Run pnpm check through the test-runner agent. Fallow must report no unused exports or files, which confirms that index.ts and data/eve-data/search.ts are gone.

**Tests.** Existing tests that guard the behavior: scope-equivalence.test.ts (full-manifest section order and results, lazy blueprint load through the apiFetch mock); search.test.ts (trim, showOnEmpty, limit ?? 5 slicing, warn on failure but stay silent on AbortError, throw when the signal is aborted, lazy load-once and retry); registry.test.ts anti-drift checks (real preference keys, one spec per route, strip surfaces); PageMenuProvider.test.ts and PageMenuSection.test.ts (slot resolution and rendering); resolve.test.ts (longest-prefix match).

Tests to add: SEARCH_SOURCES ids are unique and in a pinned order; searchOneSource(…, systemsSource) returns Jita through the mocked API; searchOneSource rejects with AbortError when the signal is aborted, which pins the contract TerminalSearch and StructureComposer rely on.

**Notes.** Behavior that must be preserved:
(a) searchAll: trim; empty query only consults showOnEmpty sources; results sliced to limit ?? 5; a non-abort failure is warned and dropped; AbortError is thrown when ctx.signal is aborted after settling.
(b) The lazy wrapper: one load promise, reset on rejection, and an abort check after load.
(c) searchOneSource passes a signed-out context with no recents.
(d) Section order equals array order, matching the current registration order.
(e) Limits stay the same: systems 10 (the eager systemsSource has the same limit as the lazy meta) and blueprints 6.

Using the eager systemsSource in useSystemSearch adds no bundle weight, because use-system-search.ts already statically imports systems-search.ts.

Dropping systems from the global list changes nothing visible: it was excludeFromDefaultScope, and GlobalSearch never passes ids.

The runtime duplicate-id console.error disappears; a static test on SEARCH_SOURCES replaces it.

Drift bug found: StructureComposer.tsx:102 lacks the rejection handler that TerminalSearch (terminal-search.tsx 53-60) has, so superseded system lookups surface as unhandled AbortError rejections. TerminalSearch's handling is the correct one.

<sub>Reported by: concern:feature-skeleton.</sub>

<a id="p048"></a>

## P048: Route GlobalSearch and CharacterSearchControl through the platform/search debounced search hook

- **Status:** [ ] not started
- **Category:** react-hook · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about -45 production lines (GlobalSearch -18, CharacterSearchControl -35, hook +8); about +90 test lines
- **Depends on:** [P039](wave-07-ui-kit-primitives-src-components-ui.md#p039)
- **Existing primitive:** `src/platform/search/use-source-search.ts:useSourceSearch`

**Problem.** platform/search/use-source-search is the canonical 'debounce, abort the in-flight query, keep the latest hits' hook. GlobalSearch rebuilds it from a separate `debounced` state, a second AbortController effect and a dead rethrow branch. CharacterSearchControl rebuilds it with its own setTimeout, AbortController and latestSearchRef, and has drifted. changeQuery (78-86) synchronously clears results, mode, busy and the popup on every change, but the fetch effect (88-114) only re-runs when the normalized `search` changes. Typing a trailing space or past the max length clears the list and never refetches. CharacterSearchControl copied the logic because useSourceSearch returns only T[] and cannot say which query a result answered.

**Verifier revision.** Both bypass sites are real, but the design changes. GlobalSearch needs no new API: searchAll already returns Promise<SearchSection[]>, so it can call useSourceSearch unchanged. The proposed failed/onError channel has no consumer. searchAll only rejects with AbortError, because each source runs through Promise.allSettled and failures are console.warn'ed (index.ts 110-135). apiFetch never throws (api-client.ts 28-47). So GlobalSearch's rethrow branch is dead code, not a live source of unhandled rejections. CharacterSearchControl does need more than T[] (busy, mode and failure from the response). It also has a drift bug the shared hook fixes: changeQuery clears results on every keystroke, but the effect is keyed on the normalized query. A trailing space, or typing past MAX_CHARACTER_SEARCH_LENGTH, wipes the results and they never come back. The revised design generalizes the hook so it returns the latest settled answer tagged with the query it answered. Freshness and busy are then derived instead of kept as reset state. The 'one extra render per keystroke' claim is wrong: the extra render happens once per debounce settle.

**Sites (9).**

- [`src/platform/search/use-source-search.ts:9-37`](../../src/platform/search/use-source-search.ts#L9-L37) — canonical hook: debounce timer, abort-previous ref, swallows rejections (catch -> null), returns T[] only; doc comment says 'one scoped source'
- [`src/components/composition/GlobalSearch.tsx:24, 30-32, 39-58`](../../src/components/composition/GlobalSearch.tsx#L24) — separate `debounced` state + abort effect; the catch rethrows non-abort errors, but searchAll never produces any; deps include session/isAdmin/recents
- [`src/features/maps/CharacterSearchControl.tsx:23, 68-136`](../../src/features/maps/CharacterSearchControl.tsx#L23) — useCharacterSearch: own 300ms timer + AbortController + latestSearchRef; busy/failed/mode/popupOpen state; reset-on-change vs normalized-search effect drift (78-86 vs 88-114)
- [`src/features/custom-structures/use-structure-search.ts:7-17`](../../src/features/custom-structures/use-structure-search.ts#L7-L17) — correct consumer; gates min length inside the search fn
- [`src/features/industry-planner/components/BlueprintSearch.tsx:11-20`](../../src/features/industry-planner/components/BlueprintSearch.tsx#L11-L20) — correct consumer; patches stale hits on clear with `query.trim() === '' ? [] : found`
- [`src/platform/search/index.ts:98-136`](../../src/platform/search/index.ts#L98-L136) — searchAll: allSettled per source, only throws AbortError; returns SearchSection[] so it fits useSourceSearch<SearchSection> directly
- [`src/transport/api-client.ts:28-47`](../../src/transport/api-client.ts#L28-L47) — apiFetch returns an outcome and never throws; an aborted fetch resolves to a network failure
- [`src/features/maps/access-editor-model.ts:162-167`](../../src/features/maps/access-editor-model.ts#L162-L167) — characterSearchPopupOpen(requestedOpen, count): pure gate the migration keeps
- [`src/features/search-recents/use-search-recents.ts:11-17`](../../src/features/search-recents/use-search-recents.ts#L11-L17) — useSyncExternalStore snapshot: stable identity, so a useCallback over recents won't loop the debounce

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/use-system-search.ts:49-94`](../../src/components/use-system-search.ts#L49-L94) — suggest() aborts the previous request but is not debounced and returns a promise to the caller. It belongs with a latest-wins read primitive, not this hook.
- [`src/components/composition/industry-workspace/AddFacility.tsx:48-60`](../../src/components/composition/industry-workspace/AddFacility.tsx#L48-L60) — useStations is a one-shot dataset load, not a per-query search
- [`src/components/composition/GlobalSearch.tsx:60-69`](../../src/components/composition/GlobalSearch.tsx#L60-L69) — Cmd/Ctrl-K focus listener; unrelated to search fetching

</details>

**Home.** `src/platform/search/use-source-search.ts (generalized core + existing wrapper); pure view helper characterSearchView in src/features/maps/access-editor-model.ts`

**Boundary check.** Home zone platform/search ({from:'platform/search', allow:[]}): the hook imports only 'react', an external package, so the rule holds. Consumers: GlobalSearch is in components-composition, whose allow list includes 'platform/search' (it already imports '@/platform/search'). CharacterSearchControl, use-structure-search and BlueprintSearch are in features (autoDiscover), whose allow list includes 'platform/search'. characterSearchView stays inside features/maps, so no cross-zone import is needed.

**API sketch.**

```ts
export interface SearchAnswer<R> { readonly query: string; readonly result: R }
/** Latest settled answer, tagged with the query it answered. Debounced; a newer query aborts the one in flight; a rejection keeps the previous answer. */
export function useSearchAnswer<R>(query: string, search: (query: string, signal: AbortSignal) => Promise<R>, debounceMs: number): SearchAnswer<R> | null;
export function useSourceSearch<T>(query: string, search: (query: string, signal: AbortSignal) => Promise<T[]>, debounceMs: number): T[]; // = useSearchAnswer(...)?.result ?? EMPTY (module-level frozen [])
// features/maps/access-editor-model.ts
export function characterSearchView(search: string, answer: SearchAnswer<CharacterSearchState | null> | null): { busy: boolean; failed: boolean; mode: 'exact' | ... | null; results: CharacterSearchResult[] };
```

**Migration steps.**

1. In use-source-search.ts, extract the body into useSearchAnswer<R>. State holds {query, result}. run(input) aborts ctrlRef, starts a new controller, awaits search(input, signal), and on success sets {query: input, result} unless the signal was aborted. Represent a rejection with a wrapper such as `.then((r) => ({ r }), () => null)`, because a null result is now a legal R. Keep the unmount abort effect.
2. Reimplement useSourceSearch as `useSearchAnswer(query, search, debounceMs)?.result ?? EMPTY`, with EMPTY a module-level constant so `items` memos keep a stable identity. Update the doc comment from 'one scoped source' to cover the all-source case. useStructureSearch and BlueprintSearch need no change.
3. GlobalSearch: delete `debounced` and `sections` state and both effects (39-58). Add `const search = useCallback((q, signal) => searchAll(q, { session, isAdmin, recents, signal }), [session, isAdmin, recents])` and `const sections = useSourceSearch(value, search, DEBOUNCE_MS)`. Leave the rest (items, hasResults, open) untouched.
4. CharacterSearchControl: add a module-level `searchCharacters(q, signal)` that returns null when q.length < MIN_CHARACTER_SEARCH_LENGTH and otherwise returns characterSearchState(await apiFetch(searchCharactersEndpoint, { body: { search: q }, cache: 'no-store', signal })).
5. In useCharacterSearch, replace results/mode/busy/failed state, latestSearchRef and the effect (69-114) with `const answer = useSearchAnswer(search, searchCharacters, SEARCH_DEBOUNCE_MS)` and `const view = characterSearchView(search, answer)`. Fresh means answer?.query === search. busy = search.length >= MIN && fresh === null.
6. Replace popupOpen state with `dismissedFor: string | null`. onOpenChange(next) sets dismissedFor to next ? null : search. open = characterSearchPopupOpen(dismissedFor !== search, available.length). changeQuery becomes plain setQuery.
7. Add characterSearchView to access-editor-model.ts next to characterSearchPopupOpen, and delete the now-unused local state helpers.

**Tests.** Add src/platform/search/use-source-search.test.ts using the repo's mocked-react pattern (see src/data/market-history/use-refresh-on-view.test.ts: useState returning a setter spy, useEffect run immediately with cleanups captured, useCallback identity, useRef object) plus vi.useFakeTimers. Cover: the debounce fires once after debounceMs; a new query aborts the previous signal; a rejection keeps the prior answer; a resolution after abort is ignored; the answer carries its query; useSourceSearch returns the same EMPTY array across calls. Extend src/features/maps/access-editor-model.test.ts with characterSearchView cases: short query (not busy, no results); pending (busy); fresh ok answer (results and mode); stale answer for an earlier search (hidden, busy); failed outcome (failed hint); and a trailing-space search equal to the answered query keeping its results (the regression). The existing src/features/maps/CharacterSearchControl.test.ts SSR idle-markup test must still pass.

**Notes.** Behavior to reconcile. (1) GlobalSearch's empty-query recents fetch was immediate on mount (`debounced` started at ''). It now waits 120ms; the panel only opens once the input is active, so this is invisible. Changes to session, isAdmin or recents are now debounced too. (2) Drop the GlobalSearch rethrow: it is unreachable, and useSourceSearch's swallow policy is correct. (3) CharacterSearch busy now also covers the 300ms debounce wait, so 'Searching…' appears slightly earlier. That is acceptable; if not, track an inFlight flag inside useSearchAnswer. (4) latestSearchRef is not purely redundant: it guarded the gap between a keystroke and React committing the cleanup abort. The query tag on the answer subsumes it. (5) Correct copy: the shared, tagged-answer behavior is right. CharacterSearch's reset-on-change is the drifted copy (bug: results vanish on whitespace-only or over-length edits). (6) Do not add onError/failed to the hook. Failure is part of the outcome (apiFetch) or swallowed per source (searchAll).

<sub>Reported by: area:components-composition, area:mapper-signatures, area:platform, concern:client-hooks.</sub>

<a id="p054"></a>

## P054: Share the server-seeded draft and map-access write steps between the map access editors, and drop the characterSearch slot

- **Status:** [ ] not started
- **Category:** react-hook · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -45 / +32 (two ref+effect re-seeds, three write sequences, the slot prop and two call-site slot fills removed; one small hook file added)
- **Depends on:** [P056](wave-07-ui-kit-primitives-src-components-ui.md#p056), [P048](#p048)
- **Existing primitive:** `src/features/maps/map-access-client.ts:updateMapAccess; src/lib/use-stable-value.ts (pattern)`

**Problem.** MapAccessDialog's useAccessGrantEditor and MapBlockList's useMapBlockEditor follow the same lifecycle. Each seeds local rows from server props, derives a revision string, keeps the applied revision in a ref, and re-seeds in a useEffect when the revision changes, so the stale draft paints for one frame before the effect corrects it. The rest of the codebase adjusts this kind of state during render. Each write repeats the same steps: set busy, clear the error, await updateMapAccess, clear busy, map failures through mapAccessFailureMessage, apply the change locally, then router.refresh(). There are three copies. Separately, AccessListEditor takes a characterSearch ReactNode slot. Both production callers fill it with a CharacterSearchControl built from props AccessListEditor already receives (currentGrants, onPrincipalAdd, disabled), so the slot is indirection with no variation.

**Verifier revision.** The core holds. useAccessGrantEditor and useMapBlockEditor are the only two places in the repo that re-seed local state from props through a revision string, a ref and an effect. Every other prop-derived state adjusts during render: src/lib/use-stable-value.ts 4-9, use-signature-update-flash.ts 34-44, use-authoring-menus.ts 28-30, scanner-scroll-dismiss.tsx 55-57, and MapCatalogue.tsx 328-334. The busy, clear-error, updateMapAccess, failure-message, apply and router.refresh sequence is written three times (commitRole, revoke, write). The characterSearch slot is fully derivable from the editor's own props: both callers pass selectedPrincipals=currentGrants and onSelect=onPrincipalAdd, and the only disabled value passed matches AccessListEditor's own. Two changes to the design. First, P056's useAsyncAction is rejected, so the write helper must not be built on it; it stands alone in features/maps. Second, the hooks need two separate instances, one per editor, because grant errors and block errors render in different banners. The stale paint is real but small: it shows for one frame, and only when the refreshed server rows differ from the locally applied draft.

**Sites (15).**

- [`src/features/maps/MapAccessDialog.tsx:59-80`](../../src/features/maps/MapAccessDialog.tsx#L59-L80) — mapAccessGrantRevision (sorted JSON of type/id/role/name) and reconcileAccessGrantDrafts (keeps pending null-role drafts)
- [`src/features/maps/MapAccessDialog.tsx:86-99`](../../src/features/maps/MapAccessDialog.tsx#L86-L99) — useState seed + serverRevision + useRef(appliedServerRevision) + useEffect re-seed
- [`src/features/maps/MapAccessDialog.tsx:101-135`](../../src/features/maps/MapAccessDialog.tsx#L101-L135) — commitRole and revoke: setBusyKey/setError/await updateMapAccess/setBusyKey(null)/mapAccessFailureMessage/apply/router.refresh; addPrincipal clears error
- [`src/features/maps/MapAccessDialog.tsx:154-155, 203-219`](../../src/features/maps/MapAccessDialog.tsx#L154-L155) — disabled = access.busyKey !== null \|\| blocks.busy; characterSearch slot filled with CharacterSearchControl(disabled, grants, addPrincipal); grant error banner
- [`src/features/maps/MapBlockList.tsx:23-35`](../../src/features/maps/MapBlockList.tsx#L23-L35) — Same ref+effect re-seed, wholesale replace with [...initialBlocks]
- [`src/features/maps/MapBlockList.tsx:37-59`](../../src/features/maps/MapBlockList.tsx#L37-L59) — write(): same busy/error/updateMapAccess/failure-message/apply/refresh sequence with boolean busy
- [`src/features/maps/MapBlockList.tsx:120`](../../src/features/maps/MapBlockList.tsx#L120) — Block errors render in MapBlockList's own banner, separate from grant errors
- [`src/features/maps/map-block-model.ts:4-6`](../../src/features/maps/map-block-model.ts#L4-L6) — mapBlockRevision (sorted id:name join)
- [`src/features/maps/AccessListEditor.tsx:55-75, 144`](../../src/features/maps/AccessListEditor.tsx#L55-L75) — Optional characterSearch?: ReactNode prop rendered verbatim between sections
- [`src/features/maps/MapCreationDialog.tsx:232-235, 277-298`](../../src/features/maps/MapCreationDialog.tsx#L232-L235) — addPrincipal is passed as both onPrincipalAdd and the slot's onSelect; selectedPrincipals=grants=currentGrants; no disabled on either
- [`src/features/maps/map-access-client.ts:7-32`](../../src/features/maps/map-access-client.ts#L7-L32) — updateMapAccess (apiFetch) and mapAccessFailureMessage, the existing write primitives
- [`src/features/maps/map-dialog-state.ts:20-25`](../../src/features/maps/map-dialog-state.ts#L20-L25) — editingMapRows returns a fresh [] when no map is selected, so a revision key (not reference identity) is still required
- [`src/lib/use-stable-value.ts:1-9`](../../src/lib/use-stable-value.ts#L1-L9) — Existing render-phase adjust primitive (pattern to follow)
- [`src/mapper/signatures/use-signature-update-flash.ts:30-44`](../../src/mapper/signatures/use-signature-update-flash.ts#L30-L44) — Second render-phase adjust precedent
- [`src/features/maps/MapCatalogue.tsx:446-459`](../../src/features/maps/MapCatalogue.tsx#L446-L459) — MapAccessDialog keyed by editingMapId, so re-seeding only has to handle same-map server refreshes

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/maps/MapCreationDialog.tsx:132-134`](../../src/features/maps/MapCreationDialog.tsx#L132-L134) — Create-form grants are seeded once from corporations and never reconciled with server rows; not a server draft
- [`src/features/maps/MapCatalogue.tsx:328-334`](../../src/features/maps/MapCatalogue.tsx#L328-L334) — storedDialogs reconcile already adjusts during render and is dialog state, not a server-seeded draft
- [`src/features/maps/CharacterSearchControl.tsx:93`](../../src/features/maps/CharacterSearchControl.tsx#L93) — setBusy(true) is debounced search state, not the access-write sequence

</details>

**Home.** `src/features/maps/use-map-access-editor.ts (exports useServerDraft and useMapAccessWrite). Promote useServerDraft to src/lib/use-server-draft.ts only when a consumer outside maps appears.`

**Boundary check.** Home and every consumer (MapAccessDialog.tsx, MapBlockList.tsx, AccessListEditor.tsx, MapCreationDialog.tsx) are in the features zone (autoDiscover src/features), so imports within the zone need no rule. The hook imports react, next/navigation (external, already used in features/maps), ./map-access-client (same zone) and the UpdateMapAccessRequest type from @/data/maps/api-contract, which features may import ('features' allow list includes data). A later move of useServerDraft to src/lib is legal because it would import only react (lib allow: config), and features may import lib.

**API sketch.**

```ts
export function useServerDraft<S, D>(server: S, revision: string, seed: (server: S, current: D | null) => D): [D, Dispatch<SetStateAction<D>>]
// state: const [draft, setDraft] = useState(() => seed(server, null)); const [applied, setApplied] = useState(revision);
// render phase: if (applied !== revision) { setApplied(revision); setDraft((current) => seed(server, current)); }

export function useMapAccessWrite<K>(): {
  readonly busy: K | null;
  readonly error: string | null;
  clearError(): void;
  run(key: K, request: UpdateMapAccessRequest, onOk: () => void): Promise<void>; // busy=key, error=null, await updateMapAccess, busy=null, error=mapAccessFailureMessage on failure, else onOk() + router.refresh()
}

// AccessListEditorProps: remove characterSearch; render <CharacterSearchControl disabled={disabled} selectedPrincipals={currentGrants} onSelect={onPrincipalAdd} /> in its place.
```

**Migration steps.**

1. Create src/features/maps/use-map-access-editor.ts with useServerDraft (adjusts during render using an applied-revision useState, following src/lib/use-stable-value.ts) and useMapAccessWrite<K> (owns useRouter, busy/error state, updateMapAccess, mapAccessFailureMessage, router.refresh).
2. Rewrite useAccessGrantEditor (MapAccessDialog.tsx 82-138): const [grants, setGrants] = useServerDraft(initialGrants, mapAccessGrantRevision(initialGrants), (server, current) => current === null ? initialDrafts(server) : reconcileAccessGrantDrafts(server, current)); const write = useMapAccessWrite<string>(); commitRole -> write.run(accessPrincipalKey(p), { operation: 'upsert', mapId, grant }, () => setGrants((c) => setAccessDraftRole('manage', addAccessPrincipal(c, p), p, role))); revoke -> write.run(key, { operation: 'revoke', ... }, () => setGrants((c) => removeAccessPrincipal(c, p))); addPrincipal calls write.clearError(). Return { grants, busyKey: write.busy, error: write.error, commitRole, revoke, addPrincipal }.
3. Rewrite useMapBlockEditor (MapBlockList.tsx 23-60): const [blocks, setBlocks] = useServerDraft(initialBlocks, mapBlockRevision(initialBlocks), (server) => [...server]); const write = useMapAccessWrite<true>(); block/unblock call write.run(true, { operation, mapId, characterId }, () => setBlocks(apply)); return busy: write.busy !== null so MapBlockEditor's shape and MapAccessDialog's disabled expression stay unchanged.
4. Delete the useEffect/useRef imports from MapAccessDialog.tsx and MapBlockList.tsx, and the useRouter/mapAccessFailureMessage/updateMapAccess imports that are now unused.
5. AccessListEditor.tsx: remove characterSearch from AccessListEditorProps (62) and the destructure (73); at line 144 render CharacterSearchControl from currentGrants/onPrincipalAdd/disabled; import ./CharacterSearchControl.
6. Remove the characterSearch prop and the CharacterSearchControl import at MapAccessDialog.tsx 28, 211-217 and MapCreationDialog.tsx 30, 292-297.
7. Update the tests (see tests), then run pnpm check through test-runner.

**Tests.** Keep MapAccessDialog.test.ts 148-186, which guards reconcileAccessGrantDrafts and mapAccessGrantRevision, and map-block-model.test.ts for mapBlockRevision. Keep MapAccessDialog.test.ts 95-108, which guards the upsert request shape that commitRole sends through the new write hook. In AccessListEditor.test.ts (lines 22 and 31), drop the characterSearch prop: either vi.mock('./CharacterSearchControl') to a probe element or assert on the real control's markup (it renders statically, see CharacterSearchControl.test.ts 8-9), and add an assertion that create mode also renders the search. In MapAccessDialog.test.ts 66-86 the AccessListEditor mock no longer receives characterSearch. Line 139 ('data-character-search') would then pass only because MapBlockList also renders the mocked control, so tighten it (count the probes or assert by label). The hook file is covered through MapAccessDialog's static render, which satisfies coverage-gaps. React's documented render-phase semantics already justify the re-seed timing, so no jsdom test is needed.

**Notes.** Behavior to preserve: (1) The grants seed must receive the current draft so reconcileAccessGrantDrafts keeps pending null-role rows (MapAccessDialog.tsx 71-80); blocks replace wholesale. (2) The two revision functions are different on purpose (grants include role, blocks are id:name); keep both. (3) Keep two write-hook instances: grant errors render at MapAccessDialog.tsx 219 and block errors at MapBlockList.tsx 120, and merging them would move error messages. (4) Grant busy is keyed per principal (string), block busy is boolean, hence the generic K. (5) commitRole's apply runs addAccessPrincipal before setAccessDraftRole so own-character toggles that are not yet listed get added; keep that order. (6) apiFetch never throws (transport/api-client.ts catches at 38 and 44), so try/finally in run() is optional hardening, not a bug fix. Do not build this on a ui useAsyncAction; that half of P056 is rejected. P056 also edits AccessListEditor.tsx and MapBlockList.tsx (the confirm targets), so land this one first to avoid conflicts.

<sub>Reported by: area:mapper-signatures, concern:client-hooks, dupes-triage-2.</sub>

<a id="p270"></a>

## P270: Extract useAuthorityScopedMapDialogs and an EditingMapAccessDialog host for MapSwitcher and MapCatalogue

- **Status:** [ ] not started
- **Category:** feature-skeleton · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -45 in MapSwitcher and MapCatalogue, about +40 for the hook and host; net about -5. One parameter and the admin-id key branch go from mapDialogAuthorityKey.
- **Depends on:** [P054](#p054)
- **Existing primitive:** `src/features/maps/map-dialog-state.ts:reconcileAuthorityScopedMapDialogs`

**Problem.** MapSwitcher and MapCatalogue each reconcile authority-scoped dialog state by hand, and their rules have drifted. MapSwitcher keys on the set of admin map ids, so after any router.refresh that changes an unrelated map's admin role, its open access editor closes. MapCatalogue keys only on listingAvailable and drops just the edit whose map lost admin. Both then mount an identical keyed MapAccessDialog (key, mapId, mapName fallback, open, onOpenChange close, corporations, initialGrants/initialBlocks via editingMapRows). The only difference is finalFocus. Only MapSwitcher uses the second parameter of mapDialogAuthorityKey (the admin-id list).

**Verifier revision.** Two of the three sites hold up. MapSwitcher and MapCatalogue run the same reconcile sequence (authority key, useState(closedMapDialogs), reconcile, currentAdminMap, setState during render). Both also mount the same keyed MapAccessDialog with 8 identical props; only finalFocus differs. The authority rule has drifted. MapSwitcher calls mapDialogAuthorityKey(true, maps), so its key includes every admin map id, and the edit dialog closes when ANY map's admin role changes. MapCatalogue calls mapDialogAuthorityKey(listingAvailable, []) and closes the edit only when the edited map loses admin, via dropLostAdminEdit. The catalogue rule is the correct one. Scope changes: MapMenu is excluded. Its two-line creationOpen guard already applies the listing-availability rule, MapMenu.test.ts:144-160 covers it, and moving it onto a three-dialog hook would only add indirection. MapLifecycleDialogs is excluded because it is a split with one consumer, not duplication. The claim that map-dialog-state.ts is a refactoring target is wrong: health-targets.txt:98 lists it only as a hotspot (score 17.5, churn 1091). The proposal's 'choose one rule' is settled here in favour of the catalogue rule. Net LOC is about zero, so the payoff is the single rule, not size.

**Sites (9).**

- [`src/features/maps/MapSwitcher.tsx:62-68`](../../src/features/maps/MapSwitcher.tsx#L62-L68) — Authority key from mapDialogAuthorityKey(true, maps), so every admin id is in the key; reconcile and setState during render; currentAdminMap. No dropLostAdminEdit.
- [`src/features/maps/MapSwitcher.tsx:132-137`](../../src/features/maps/MapSwitcher.tsx#L132-L137) — Opens the edit by setting editingMapId.
- [`src/features/maps/MapSwitcher.tsx:147-165`](../../src/features/maps/MapSwitcher.tsx#L147-L165) — Keyed MapAccessDialog mount; finalFocus = connectedDialogFocus(triggerRef, focusFallback).
- [`src/features/maps/MapCatalogue.tsx:323-365`](../../src/features/maps/MapCatalogue.tsx#L323-L365) — useMapCatalogueDialogs: key from mapDialogAuthorityKey(listingAvailable, []), then reconcile, currentAdminMap, dropLostAdminEdit and setState during render. Returns 14 fields, which MapCatalogueContent destructures at 377-392.
- [`src/features/maps/MapCatalogue.tsx:402-421`](../../src/features/maps/MapCatalogue.tsx#L402-L421) — Create, manage and trash handlers set opener refs and patch dialog state.
- [`src/features/maps/MapCatalogue.tsx:444-460`](../../src/features/maps/MapCatalogue.tsx#L444-L460) — The same keyed MapAccessDialog mount; finalFocus = connectedDialogFocus(editOpenerRef, catalogueRef).
- [`src/features/maps/map-dialog-state.ts:27-60`](../../src/features/maps/map-dialog-state.ts#L27-L60) — mapDialogAuthorityKey (its maps parameter is used only by MapSwitcher), closedMapDialogs, reconcileAuthorityScopedMapDialogs, dropLostAdminEdit.
- [`src/features/maps/map-dialog-state.test.ts:22-65`](../../src/features/maps/map-dialog-state.test.ts#L22-L65) — Asserts the admin-id-keyed behaviour ('downgraded' becomes available:, a listing plus a new admin map closes everything). Must change with the unified rule.
- [`src/components/composition/map/MapChrome.tsx:19-52`](../../src/components/composition/map/MapChrome.tsx#L19-L52) — Already has listingAvailable from useMapCatalogueData and passes it to MapMenu, but not to MapSwitcher (which hard-codes true).

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/map/MapMenu.tsx:160-163, 241-248`](../../src/components/composition/map/MapMenu.tsx#L160-L163) — Only a creation dialog, closed when mapActionsAvailable (that is, listingAvailable) is false. This is the same listing rule, implemented in two lines and covered by MapMenu.test.ts:144-160. Moving it onto a create/trash/edit hook adds indirection.
- [`src/features/maps/MapLifecycleDialogs.tsx:13-54`](../../src/features/maps/MapLifecycleDialogs.tsx#L13-L54) — Create/trash host with one consumer (MapCatalogue). It is a complexity split, not a duplicate.
- [`src/features/maps/map-dialog-state.ts:62-67`](../../src/features/maps/map-dialog-state.ts#L62-L67) — connectedDialogFocus is already the shared primitive; MapMenu, MapLifecycleDialogs, MapSwitcher and MapCatalogue all use it.

</details>

**Home.** `src/features/maps/use-authority-scoped-map-dialogs.ts (hook); EditingMapAccessDialog exported from src/features/maps/MapAccessDialog.tsx`

**Boundary check.** The hook and the host live in the features/maps zone ("features" autoDiscover child of src/features). Both consumers, src/features/maps/MapSwitcher.tsx and src/features/maps/MapCatalogue.tsx, are in the same zone, so the imports are intra-zone and need no rule. The hook imports AuthorizedMapRow from src/data/maps, which the features rule allows ('data'). Passing listingAvailable from src/components/composition/map/MapChrome.tsx (components-composition) into MapSwitcher is allowed by the components-composition rule, which lists 'features'. MapMenu is untouched.

**API sketch.**

```ts
export function useAuthorityScopedMapDialogs(maps: readonly AuthorizedMapRow[], listingAvailable: boolean): {
  readonly dialogs: AuthorityScopedMapDialogs;
  readonly setDialogs: Dispatch<SetStateAction<AuthorityScopedMapDialogs>>;
  readonly editingMap: AuthorizedMapRow | null; // non-null iff dialogs.editingMapId !== null after reconcile
};

export function EditingMapAccessDialog(props: {
  editingMap: AuthorizedMapRow | null;
  onClose: () => void;
  finalFocus: () => HTMLElement | null;
  corporations: readonly CorporationAccessOption[];
  grantsByMapId: Readonly<Record<string, readonly MapAccessGrantOption[]>>;
  blocksByMapId: Readonly<Record<string, readonly MapBlockOption[]>>;
}): JSX.Element | null; // renders <MapAccessDialog key={editingMap.id} mapId mapName open onOpenChange={o => !o && onClose()} ... />

// map-dialog-state.ts
export function mapDialogAuthorityKey(listingAvailable: boolean): string; // maps parameter removed
```

**Migration steps.**

1. In map-dialog-state.ts, change mapDialogAuthorityKey to take only listingAvailable and return 'available' or 'unavailable'. Rewrite map-dialog-state.test.ts:22-65 to the listing-only key: losing the listing closes everything, and recovery stays closed. Admin downgrades are now covered by the existing dropLostAdminEdit test at 67-88.
2. Add use-authority-scoped-map-dialogs.ts, moving MapCatalogue.tsx:327-334 verbatim: key, useState(closedMapDialogs), reconcile, currentAdminMap, dropLostAdminEdit, then setState during render when the result changed. Return { dialogs, setDialogs, editingMap }.
3. Add EditingMapAccessDialog to MapAccessDialog.tsx. Base it on MapCatalogue.tsx:444-460, with finalFocus and onClose as props. Keep key={editingMap.id} so switching maps remounts the editor state, and keep editingMapRows for initialGrants and initialBlocks.
4. Migrate MapCatalogue first: drop dialogs, setStoredDialogs and currentEditingMap from useMapCatalogueDialogs, call the new hook in MapCatalogueContent, and replace 444-460 with <EditingMapAccessDialog ... finalFocus={() => finalFocus(editOpenerRef.current)} />. Keep the remaining ref bundle only if MapCatalogueContent would otherwise exceed Fallow maxCognitive 15.
5. Migrate MapSwitcher: add a listingAvailable prop (MapChrome.tsx passes the value it already reads at line 24), replace 62-68 with the hook, set the edit via setDialogs at 132-137, and replace 147-165 with the host, using finalFocus = connectedDialogFocus(triggerRef.current, focusFallback?.current).
6. Delete the now-unused imports (closedMapDialogs, reconcileAuthorityScopedMapDialogs, currentAdminMap, mapDialogAuthorityKey) from both hosts. Run Fallow to confirm no export of map-dialog-state.ts is left unused.

**Tests.** Existing guards: map-dialog-state.test.ts (rewrite the first case for the listing-only key), MapCatalogue.test.ts (it mocks MapAccessDialog at line 50, so update the mock target to cover the host or keep mocking MapAccessDialog), MapSwitcher.test.ts:91-129 (render only), and MapChrome.test.ts:168 ('disables map actions when the shared listing snapshot is unavailable'). Add a MapSwitcher test using the mocked-useState pattern from MapMenu.test.ts:18-25. It should check that the edit dialog stays mounted when a different map's role changes, and unmounts when the edited map is downgraded from admin. Add a small hook-level test of the reconcile sequence through the same useState mock.

**Notes.** Behaviour differences to reconcile:
- Authority rule. MapSwitcher (admin-id key) closes the access editor whenever any map gains or loses admin after a refresh. MapCatalogue (listing key plus dropLostAdminEdit) closes it only when the edited map loses admin. The catalogue rule is correct. MapAccessDialog commits each grant immediately (it calls router.refresh in useAccessGrantEditor), so the switcher's drift loses no saved data, but the dialog vanishes and focus jumps.
- MapSwitcher currently hard-codes listingAvailable=true. When the listing is unavailable, maps is likely empty and the switcher renders null anyway, so passing the real flag changes nothing visible.
- finalFocus differs per host and must stay a prop.
- After dropLostAdminEdit, editingMapId !== null implies editingMap !== null in the same render, so the host can mount on editingMap with open={true}. To be conservative, keep open={editingMap !== null}.
- Keep the React-sanctioned set-state-during-render pattern; do not convert it to useEffect, which would flash the stale dialog for a frame.

<sub>Reported by: area:mapper-signatures.</sub>

← [Wave 11: ESI reads, owner-sync and owner-dataset persistence](wave-11-esi-reads-owner-sync-and-owner-dataset.md) · [Index](README.md#roadmap) · [Wave 13: Industry planner and wormhole-sites verticals](wave-13-industry-planner-and-wormhole-sites-verticals.md) →
