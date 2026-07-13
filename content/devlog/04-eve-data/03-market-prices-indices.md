## Market Prices & Indices

Market prices are not static game data, and they are not private character data. They sit in the middle.

CCP’s ESI docs frame the constraint the same way they did for the gate: ESI is a shared resource, callers should identify themselves, respect cache headers, and avoid wasting requests. The `Expires` header is the contract for when updated data should be available, and the docs warn that fetching before the cache window can waste resources or be treated as cache circumvention. The same page says cache circumvention can get an app banned from ESI, which is why the market system cannot be “just refresh everything whenever a page wants it.” citeturn566653view0turn566320view0

That is the external shape of the problem. Market data needs to feel current enough for a planner, but it still has to behave like a good ESI citizen. LGI.tools needs Jita prices when a pilot opens a blueprint, stale-but-usable values when ESI or a fallback source is having a bad day, and daily CCP industry inputs for job-fee math. Those are related datasets, but they are not the same thing.

The first market-price version used Fuzzwork because it was practical. PR #28 moved the primary source to ESI and kept Fuzzwork as a circuit-breaker fallback. That split still matters. ESI is the preferred source because it is CCP’s official order data. Fuzzwork remains an escape hatch because a planner that can show a clearly attributed fallback value is more useful than a planner that collapses every time ESI has a rough minute. The row’s `source` field preserves that difference, so later code can tell an official ESI row from a fallback row instead of treating all prices as equally fresh truth.<sup><a href="#code-market-schema">1</a></sup>

The market source module turns raw orders into the narrower projection the app actually uses: best buy, best sell, 5-percent buy and sell, side volumes, and near-touch depth. The 5-percent calculation is one of those details that looks small until it is wrong. The first implementation walked to the price where the threshold crossed, which let thin top orders skew the result. The corrected version computes a volume-weighted average over the closest 5 percent of side volume, matching the Fuzzwork-style semantic the app had already been relying on. That made the source swap a real migration instead of a hidden change in pricing math.<sup><a href="#code-market-price-math">2</a></sup>

The later depth ladder is the same kind of defensive projection. Best price alone does not tell you how much market is actually there. A one-unit order at the top of book can make the “best” number look good while the usable liquidity is somewhere behind it. The repo now stores cumulative volume within fixed bands from the best price. The important rule is that the bands are anchored to the touch price, not to the 5-percent value, because a far-out whale order can distort a 5-percent calculation by changing total volume. Anchoring depth to best price makes that particular manipulation less useful.<sup><a href="#code-market-constants">3</a></sup><sup><a href="#code-market-price-math">2</a></sup>

Fetching has two shapes. When the app needs a large stale set, it can stream The Forge region order book page by page and filter to the requested type IDs in memory. When it needs a smaller set, it calls ESI per type with bounded concurrency. Both paths go through the shared ESI gate. Both validate the response body before using it. Both preserve the fallback path. And the bulk path has a cancellation flag so one failing page does not leave the other workers draining hundreds of pages and burning budget after the result is already doomed.<sup><a href="#code-market-source-dispatch">4</a></sup><sup><a href="#code-market-fetch-paths">5</a></sup>

Persistence is deliberately boring. The `market_prices` table is keyed by EVE type ID, has nullable price and volume fields so “no orders” is different from zero, and carries `updated_at`, `stale_after`, and `source`. Writes are chunked because the full tracked type set would otherwise run into Postgres bind-parameter limits. The price rows are independent and idempotent, so splitting the upsert is safer than pretending every refresh must be one giant transaction. That also keeps the same write path usable from both the cron’s postgres-js client and the request-path Neon HTTP driver.<sup><a href="#code-market-schema">1</a></sup><sup><a href="#code-market-persist">6</a></sup>

PR #62 changed the user-facing freshness model. Instead of treating the background job as the only source of truth, the app refreshes prices when someone actually opens a blueprint or other price-consuming surface. The server reads the durable database seed, performs a coalesced live fetch, returns the freshest value it has, and persists the fresh row behind the response. If the live fetch fails and a seed exists, the user still gets a value, but the path does not pretend that value was just confirmed.<sup><a href="#code-market-refresh-on-view">7</a></sup>

PR #64 then demoted the background job into a backstop. The nightly sweep now refreshes only rows whose `stale_after` has expired, which means it mostly covers the cases the browser path does not: crawlers, link previews, server-rendered snapshots, missed user traffic, or ESI being unavailable when someone viewed a page. That also let the project remove the price-refresh advisory lock. The cron is the only bulk writer, and a race with an on-view refresh is last-write-wins between two freshly fetched rows. The SDE ingest still needs destructive serialization; prices do not.<sup><a href="#code-market-cache">8</a></sup>

PR #51 added the observability I wish had been there earlier. A fallback is not just a success with a different source. It is a degraded source path. The refresh summary carries source counts and whether the ESI budget was exhausted, and the cron records skipped runs separately from refreshed runs. That distinction matters because “nothing needed refreshing,” “ESI degraded and Fuzzwork saved us,” and “the budget gate refused dispatch” are three different operational stories. If they all look green, the site can be quietly unhealthy for a long time.<sup><a href="#code-market-persist">6</a></sup>

Industry indices are the other half of this chapter. These are not order-book prices. They are CCP’s daily inputs for industry job-fee math: per-system cost indices and adjusted item prices. PR #100 added them as their own data slice because the planner eventually needs them, but they should not be tangled into the market-price table. They live in pure number space, keyed by raw CCP IDs, with no foreign keys back to the SDE tables. That keeps the daily feed independent of whether a static-data ingest has just run.<sup><a href="#code-industry-index-schema">9</a></sup>

The industry-index source is intentionally narrower than the market-price source. It makes two gated ESI calls: `/industry/systems/` for cost indices and `/markets/prices/` for adjusted prices. Both responses are validated at the boundary. Cost indices are flattened from CCP’s nested per-system shape into one row per system and activity. Adjusted prices preserve the difference between a real zero and a missing value by storing absent `adjusted_price` as `null`.<sup><a href="#code-industry-index-source">10</a></sup>

The refresh path treats those two datasets independently. If cost indices fail, adjusted prices can still refresh. If adjusted prices fail, cost indices can still refresh. The cron has its own advisory lock, but the lock is there to avoid redundant double-pulls, not because overlapping writes would corrupt the data. Each dataset is upserted in chunks, and the cron records the result of each side separately.<sup><a href="#code-industry-index-refresh">11</a></sup><sup><a href="#code-industry-index-cron">12</a></sup>

That is the pattern this section is really about. Market prices are live enough to refresh on view, durable enough to seed future reads, and honest enough to preserve source attribution when they fall back. Industry indices are slower daily inputs, refreshed as bulk public datasets and kept separate from order-book pricing. Both go through the ESI gate. Both validate external shapes before storing them. Both write to Neon as reusable shared data instead of making every feature invent its own fetch path.

The mistake would be letting the planner ask ESI directly because it “just needs a price.” The better rule is that EVE market data has an owner: source reads, fallback behavior, staleness, persistence, and telemetry live in the data layer. Features consume the resulting rows and can explain what they mean.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-market-schema" file="src/data/market-prices/schema.ts" lines="15-23,25-46" lang="ts" -->
```ts
// Live market prices keyed by Eve type ID. Region is fixed to Jita
// (10000002) — set in phase 2. No FK to eve_types: this slice operates
// in pure number space and must not depend on the eve-data slice's
// schema being populated first.
//
// Nullable price + volume columns: when a market side has zero orders
// we store NULL so consumers can distinguish "no live price" from a
// real value. updated_at + stale_after are set explicitly on every
// refresh batch; the bulk refresh path filters on stale_after < NOW().

export const marketPrices = pgTable(
  'market_prices',
  {
    typeId: integer('type_id').primaryKey(),
    bestBuy: doublePrecision('best_buy'),
    bestSell: doublePrecision('best_sell'),
    pct5Buy: doublePrecision('pct5_buy'),
    pct5Sell: doublePrecision('pct5_sell'),
    buyVolume: bigint('buy_volume', { mode: 'bigint' }),
    sellVolume: bigint('sell_volume', { mode: 'bigint' }),
    buyDepth: jsonb('buy_depth').$type<DepthBand[]>(),
    sellDepth: jsonb('sell_depth').$type<DepthBand[]>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    staleAfter: timestamp('stale_after', { withTimezone: true }).notNull(),
    source: text('source').notNull().default('fuzzwork'),
  },
  (t) => ({
    staleAfterIdx: index('market_prices_stale_after_idx').on(t.staleAfter),
  }),
);
```

<!-- uth:code id="code-market-price-math" file="src/data/market-prices/source.ts" lines="138-187,189-221,224-241" lang="ts" -->
```ts
export function computeSide(
  orders: OrderEntry[],
  direction: 'asc' | 'desc',
): { best: number | null; pct5: number | null; volume: bigint | null } {
  if (orders.length === 0) return { best: null, pct5: null, volume: null };

  const sorted = [...orders].sort((a, b) =>
    direction === 'asc' ? a.price - b.price : b.price - a.price,
  );
  const best = sorted[0].price;

  let totalVolume = BigInt(0);
  for (const o of sorted) totalVolume += o.volume;

  const fivePct = totalVolume * BigInt(5);
  const threshold =
    fivePct % BigInt(100) === BigInt(0)
      ? fivePct / BigInt(100)
      : fivePct / BigInt(100) + BigInt(1);

  let used = BigInt(0);
  let weightedSum = 0;
  for (const o of sorted) {
    const remaining = threshold - used;
    if (remaining <= BigInt(0)) break;
    const take = o.volume < remaining ? o.volume : remaining;
    weightedSum += o.price * Number(take);
    used += take;
  }

  return { best, pct5: weightedSum / Number(used), volume: totalVolume };
}

export function computeDepth(
  orders: OrderEntry[],
  direction: 'asc' | 'desc',
  best: number | null,
): DepthBand[] | null {
  if (best === null || orders.length === 0) return null;
  const sums = DEPTH_BANDS_PCT.map(() => 0);
  for (const o of orders) {
    for (let i = 0; i < DEPTH_BANDS_PCT.length; i++) {
      const band = DEPTH_BANDS_PCT[i];
      const within =
        direction === 'desc'
          ? o.price >= best * (1 - band / 100)
          : o.price <= best * (1 + band / 100);
      if (within) sums[i] += Number(o.volume);
    }
  }
  return DEPTH_BANDS_PCT.map((pct, i) => ({ pct, cumVolume: sums[i] }));
}
```

<!-- uth:code id="code-market-constants" file="src/data/market-prices/constants.ts" lines="8-15,22-37,52-63" lang="ts" -->
```ts
// Per-row TTL. Every write sets stale_after = NOW() + STALE_AFTER_TTL_MS.
// Its only remaining role is the "last refreshed" marker the nightly sweep
// keys off. It does NOT gate the live view path: getLivePrices always fetches
// live regardless of staleAfter.
export const STALE_AFTER_TTL_MS = 24 * 60 * 60 * 1000;

export const BULK_THRESHOLD = 100;
export const PAGE_CONCURRENCY = 8;
export const PER_TYPE_CONCURRENCY = 10;

// Price-distance bands (percent from the BEST price on each side) for the
// near-touch depth ladder.
export const DEPTH_BANDS_PCT = [0.5, 1, 2, 5, 10] as const;
```

<!-- uth:code id="code-market-source-dispatch" file="src/data/market-prices/source.ts" lines="22-31,42-63,75-86" lang="ts" -->
```ts
// ESI source dispatcher. Above BULK_THRESHOLD types stale at once, the
// region-dump path streams every order in The Forge and filters in memory.
// Below the threshold, per-type calls are cheaper. Either way, a Fuzzwork
// fallback covers ESI degradation.

const esiOrderSchema = z.object({
  type_id: z.number(),
  is_buy_order: z.boolean(),
  price: z.number(),
  volume_remain: z.number(),
});

function parseEsiOrders(body: unknown): EsiOrder[] {
  const result = esiOrdersSchema.safeParse(body);
  if (!result.success) throw new EsiContractError();
  return result.data;
}

function filterRawByWantedType(body: unknown, wanted: Set<number>): unknown[] {
  if (!Array.isArray(body)) throw new EsiContractError();
  return body.filter((o) => {
    const typeId = (o as { type_id?: unknown } | null)?.type_id;
    return typeof typeId === 'number' && wanted.has(typeId);
  });
}

// Bounded-concurrency worker pool. If any worker throws, a shared `cancelled`
// flag short-circuits the other workers' next iteration.
```

<!-- uth:code id="code-market-fetch-paths" file="src/data/market-prices/source.ts" lines="258-264,266-319,339-390" lang="ts" -->
```ts
function regionDumpPageUrl(page: number): string {
  return esiUrl(`/markets/${ESI_REGION_ID_FORGE}/orders/?order_type=all&page=${page}`);
}

function perTypeUrl(typeId: number): string {
  return esiUrl(`/markets/${ESI_REGION_ID_FORGE}/orders/?type_id=${typeId}&order_type=all`);
}

async function fetchViaEsiRegionDump(typeIds: number[]): Promise<RawMarketPrice[]> {
  const wanted = new Set(typeIds);
  const buckets = new Map<number, OrderBucket>();

  const firstRes = await esiFetch(regionDumpPageUrl(1));
  if (!firstRes.ok) throw new EsiServerError(firstRes.status);

  const totalPages = Number(firstRes.headers.get('X-Pages') ?? '1');
  const firstOrders = parseEsiOrders(await firstRes.json());
  absorbOrders(firstOrders, wanted, buckets);

  if (totalPages > 1) {
    const pages: number[] = [];
    for (let p = 2; p <= totalPages; p++) pages.push(p);
    await runConcurrent(pages, PAGE_CONCURRENCY, async (page) => {
      const res = await esiFetch(regionDumpPageUrl(page));
      if (!res.ok) throw new EsiServerError(res.status);
      const orders = parseEsiOrders(filterRawByWantedType(await res.json(), wanted));
      absorbOrders(orders, wanted, buckets);
    });
  }

  return bucketsToRawPrices(typeIds, buckets);
}

export async function fetchPricesFromSource(
  typeIds: number[],
): Promise<{ prices: RawMarketPrice[]; budgetExhausted: boolean }> {
  if (typeIds.length === 0) return { prices: [], budgetExhausted: false };
  const unique = dedupe(typeIds);

  if (unique.length >= BULK_THRESHOLD) {
    try {
      return { prices: await fetchViaEsiRegionDump(unique), budgetExhausted: false };
    } catch (err) {
      const prices = await fallbackToFuzzwork(unique);
      return { prices, budgetExhausted: err instanceof EsiBudgetExhaustedError };
    }
  }

  return fetchViaEsiPerType(unique);
}
```

<!-- uth:code id="code-market-persist" file="src/data/market-prices/ingest.ts" lines="10-22,61-90,106-145" lang="ts" -->
```ts
export interface RefreshSummary {
  requested: number;
  fetched: number;
  written: number;
  durationMs: number;
  esiCount: number;
  fuzzworkFallbackCount: number;
  budgetExhausted: boolean;
}

export async function persistPrices(
  db: AnyPgDb,
  raw: RawMarketPrice[],
  meta?: { requested?: number; budgetExhausted?: boolean },
): Promise<RefreshSummary> {
  const updatedAt = new Date();
  const staleAfter = new Date(updatedAt.getTime() + STALE_AFTER_TTL_MS);

  const rows = raw.map((r) => ({
    typeId: r.typeId,
    bestBuy: r.bestBuy,
    bestSell: r.bestSell,
    pct5Buy: r.pct5Buy,
    pct5Sell: r.pct5Sell,
    buyVolume: r.buyVolume,
    sellVolume: r.sellVolume,
    buyDepth: r.buyDepth,
    sellDepth: r.sellDepth,
    updatedAt,
    staleAfter,
    source: r.source,
  }));

  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db
      .insert(marketPrices)
      .values(rows.slice(i, i + BATCH))
      .onConflictDoUpdate({
        target: marketPrices.typeId,
        set: {
          bestBuy: excluded('best_buy'),
          bestSell: excluded('best_sell'),
          pct5Buy: excluded('pct5_buy'),
          pct5Sell: excluded('pct5_sell'),
          buyVolume: excluded('buy_volume'),
          sellVolume: excluded('sell_volume'),
          buyDepth: excluded('buy_depth'),
          sellDepth: excluded('sell_depth'),
          updatedAt: excluded('updated_at'),
          staleAfter: excluded('stale_after'),
          source: excluded('source'),
        },
      });
  }
}
```

<!-- uth:code id="code-market-refresh-on-view" file="src/data/market-prices/refresh-on-view.ts" lines="12-21,51-68,92-155" lang="ts" -->
```ts
// Refresh-on-view engine: read the durable DB seed, fetch live (coalesced so
// concurrent viewers of the same item share one source call), return the freshest
// available value, and persist the fresh rows back as the new seed behind the
// response.

async function fetchLivePrice(
  typeId: number,
): Promise<{ raw: RawMarketPrice | null; budgetExhausted: boolean }> {
  'use cache: remote';
  cacheTag(priceTag(typeId));
  cacheLife(LIVE_CACHE_LIFE);
  const { prices, budgetExhausted } = await fetchPricesFromSource([typeId]);
  return { raw: prices[0] ?? null, budgetExhausted };
}

export async function getLivePrices(typeIds: number[]): Promise<LivePricesResult> {
  const ids = [...new Set(typeIds)];
  const seed = await getPrices(ids);

  const live = await mapBounded(ids, PER_TYPE_CONCURRENCY, async (id) => {
    try {
      return await fetchLivePrice(id);
    } catch {
      return { raw: null as RawMarketPrice | null, budgetExhausted: false };
    }
  });

  const prices = new Map<number, MarketPrice>();
  const freshRaws: RawMarketPrice[] = [];

  ids.forEach((id, i) => {
    const { raw } = live[i];
    if (raw) {
      freshRaws.push(raw);
      prices.set(id, { ...raw, updatedAt: now, staleAfter });
    } else {
      const seeded = seed.get(id);
      if (seeded) prices.set(id, seeded);
    }
  });

  if (freshRaws.length > 0) {
    after(async () => {
      try {
        await persistPrices(db, freshRaws);
      } catch (err) {
        console.error('[market-prices/refresh-on-view] write-behind failed', err);
      }
    });
  }

  return { prices, degraded };
}
```

<!-- uth:code id="code-market-cache" file="src/data/market-prices/cache.ts" lines="46-64,81-107" lang="ts" -->
```ts
export const PRICES_FRESHNESS_TAG = 'market-prices-freshness';

export async function getCachedPricesFreshness(): Promise<{ lastUpdatedAt: Date | null }> {
  'use cache';
  cacheLife('hours');
  cacheTag(PRICES_FRESHNESS_TAG);
  return withColdStartRetry(() => getPricesFreshness(db));
}

// Nightly backstop sweep. Refreshes only the type IDs with stale_after < NOW()
// — the rows the on-demand view path hasn't refreshed within the TTL window.
export async function refreshStalePrices(client: Sql): Promise<CachedRefreshResult> {
  const db = drizzle(client);

  const typeIds = await listStaleTypeIds(db);
  if (typeIds.length === 0) {
    const { lastUpdatedAt } = await getPricesFreshness(db);
    return { status: 'cached', reason: 'empty-set', lastUpdatedAt };
  }

  const summary = await refreshPrices(db, typeIds);
  const { lastUpdatedAt } = await getPricesFreshness(db);
  return {
    status: 'refreshed',
    lastUpdatedAt: lastUpdatedAt ?? new Date(),
    summary,
  };
}
```

<!-- uth:code id="code-industry-index-schema" file="src/data/industry-indices/schema.ts" lines="12-24,25-46" lang="ts" -->
```ts
// Two daily-refreshed CCP datasets that feed industry job-fee math (EIV +
// cost-index). Both operate in pure number space — no FK to eve-data — keyed by
// raw CCP IDs, the same decoupling as market_prices.

export const industryCostIndices = pgTable(
  'industry_cost_indices',
  {
    solarSystemId: integer('solar_system_id').notNull(),
    activity: text('activity').notNull(),
    costIndex: doublePrecision('cost_index').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.solarSystemId, t.activity] }),
  }),
);

export const adjustedPrices = pgTable('adjusted_prices', {
  typeId: integer('type_id').primaryKey(),
  adjustedPrice: doublePrecision('adjusted_price'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
```

<!-- uth:code id="code-industry-index-source" file="src/data/industry-indices/source.ts" lines="8-18,25-47,51-88" lang="ts" -->
```ts
// ESI source for the two daily industry datasets. Both endpoints return the
// full dataset in a single response, so each is one gated GET.

const costIndicesBodySchema = z.array(
  z.object({
    solar_system_id: z.number(),
    cost_indices: z.array(
      z.object({ activity: z.string(), cost_index: z.number() }),
    ),
  }),
);

const adjustedPricesBodySchema = z.array(
  z.object({
    type_id: z.number(),
    adjusted_price: z.number().optional(),
  }),
);

export function parseCostIndices(body: unknown): RawCostIndex[] {
  const result = costIndicesBodySchema.safeParse(body);
  if (!result.success) throw new EsiContractError();

  const out: RawCostIndex[] = [];
  for (const system of result.data) {
    for (const entry of system.cost_indices) {
      if (!isIndustryActivity(entry.activity)) continue;
      out.push({
        solarSystemId: system.solar_system_id,
        activity: entry.activity,
        costIndex: entry.cost_index,
      });
    }
  }
  return out;
}

export async function fetchCostIndices(): Promise<RawCostIndex[]> {
  const res = await esiFetch(esiUrl('/industry/systems/'));
  if (!res.ok) throw new EsiServerError(res.status);
  return parseCostIndices(await res.json());
}

export async function fetchAdjustedPrices(): Promise<RawAdjustedPrice[]> {
  const res = await esiFetch(esiUrl('/markets/prices/'));
  if (!res.ok) throw new EsiServerError(res.status);
  return parseAdjustedPrices(await res.json());
}
```

<!-- uth:code id="code-industry-index-refresh" file="src/data/industry-indices/ingest.ts" lines="22-36,89-130" lang="ts" -->
```ts
export interface DatasetResult {
  ok: boolean;
  written: number;
  error?: string;
}

export interface RefreshIndicesSummary {
  costIndices: DatasetResult;
  adjustedPrices: DatasetResult;
  durationMs: number;
}

// Fetch + persist one dataset, isolating its failure so the sibling still runs.
async function refreshDataset<T>(
  fetcher: () => Promise<T[]>,
  persist: (rows: T[]) => Promise<number>,
): Promise<DatasetResult> {
  try {
    const rows = await fetcher();
    const written = await persist(rows);
    return { ok: true, written };
  } catch (err) {
    return {
      ok: false,
      written: 0,
      error: err instanceof Error ? err.constructor.name : 'unknown',
    };
  }
}

export async function refreshIndustryIndices(db: AnyPgDb): Promise<RefreshIndicesSummary> {
  const start = Date.now();
  const updatedAt = new Date();

  const [costIndices, adjustedPricesResult] = await Promise.all([
    refreshDataset(fetchCostIndices, (rows) => persistCostIndices(db, rows, updatedAt)),
    refreshDataset(fetchAdjustedPrices, (rows) => persistAdjustedPrices(db, rows, updatedAt)),
  ]);

  return {
    costIndices,
    adjustedPrices: adjustedPricesResult,
    durationMs: Date.now() - start,
  };
}
```

<!-- uth:code id="code-industry-index-cron" file="src/app/api/cron/refresh-industry-indices/route.ts" lines="23-33,45-79,80-92" lang="ts" -->
```ts
// Refreshes both daily CCP industry datasets (system cost indices + adjusted
// prices) under an advisory lock that skips an overlapping run of itself — the
// upserts are idempotent, so the lock guards against a redundant double ESI
// pull, not data integrity.

export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const denied = await requireCronAuth(req);
  if (denied) return denied;

  const reserved = await directClient.reserve();
  let lockHeld = false;
  try {
    const lockResult = await reserved<{ got: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY_NUM}) AS got
    `;
    if (!lockResult[0].got) {
      await logCronEvent({ outcome: 'busy', durationMs: Date.now() - start });
      return Response.json({ status: 'busy' } satisfies CronRefreshIndustryIndicesResponse);
    }
    lockHeld = true;

    const summary = await refreshIndustryIndices(drizzle(directClient));
    await logCronEvent({
      outcome: 'refreshed',
      costIndices: summary.costIndices,
      adjustedPrices: summary.adjustedPrices,
      durationMs: summary.durationMs,
    });

    return Response.json({ status: 'refreshed', costIndices, adjustedPrices });
  } finally {
    try {
      if (lockHeld) {
        await reserved`SELECT pg_advisory_unlock(${LOCK_KEY_NUM})`;
      }
    } finally {
      reserved.release();
    }
  }
}
```
<!-- uth:code-excerpts:end -->

