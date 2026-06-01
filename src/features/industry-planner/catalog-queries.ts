import { and, eq, inArray, sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import {
  blueprintFlatMaterials,
  eveCategories,
  eveGroups,
  eveTypes,
  industryActivityMaterials,
  industryActivityProducts,
  marketPrices,
} from '@/db/schema';
import { BLUEPRINT_STRUCTURE_TAG, INDUSTRY_ACTIVITY_IDS } from '@/data/eve-data/constants';
import { getTypeLabels } from '@/data/eve-data/queries';
import { computeMargin } from '@/data/industry-math/profitability';
import { PRICES_FRESHNESS_TAG } from '@/data/market-prices/cache';
import { getPrices } from '@/data/market-prices/queries';
import type { CatalogRow, DirectInputRow, DirectInputsView } from './browse-types';
import { aggregateConfidenceFromCounts, THIN_LIQUIDITY_UNITS } from './industry-styles';

// Discovery-browse queries. This feature is the compose layer over the
// eve-data, market-prices, and industry-math data slices (feature → data is
// allowed; data ⊥ data is not). Browsing reads only what's already in
// `market_prices` — NO refresh, NO ESI — so it never fires per-blueprint
// price fetches; freshness stays the cron's job.

const ACTIVITY_IDS = Array.from(INDUSTRY_ACTIVITY_IDS);

// One product per blueprint: prefer manufacturing (the lower activity id) when
// a blueprint carries both, matching getBlueprintStructure / the search index.
function pickByBlueprint<T extends { blueprintTypeId: number; activityId: number }>(
  rows: T[],
): Map<number, T> {
  const out = new Map<number, T>();
  for (const r of rows) {
    const existing = out.get(r.blueprintTypeId);
    if (!existing || r.activityId < existing.activityId) out.set(r.blueprintTypeId, r);
  }
  return out;
}

// The full browse catalog: every resolved buildable product with its margin,
// build cost, and an aggregate price-confidence verdict. ONE batched aggregate
// over the precomputed `blueprint_flat_materials` (the recursed cost basis)
// joined to `market_prices` — no N+1, no per-blueprint flattening. Returns ALL
// rows unfiltered/unsorted; the page filters (category/band), sorts, and caps.
// No args → ONE cache entry, busted hourly by the prices cron (and on SDE
// re-ingest). Confidence staleness uses SQL NOW(), frozen for the cache window
// (consistent with the price snapshot the row is built from).
export async function getBlueprintCatalog(): Promise<CatalogRow[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(PRICES_FRESHNESS_TAG, BLUEPRINT_STRUCTURE_TAG);

  // (a) One product row per blueprint, with name + SDE category. SDE-only.
  const productRows = await db
    .select({
      blueprintTypeId: industryActivityProducts.blueprintTypeId,
      activityId: industryActivityProducts.activityId,
      productTypeId: industryActivityProducts.productTypeId,
      quantity: industryActivityProducts.quantity,
      name: eveTypes.name,
      categoryName: eveCategories.name,
    })
    .from(industryActivityProducts)
    .innerJoin(eveTypes, eq(eveTypes.id, industryActivityProducts.productTypeId))
    .innerJoin(eveGroups, eq(eveGroups.id, eveTypes.groupId))
    .innerJoin(eveCategories, eq(eveCategories.id, eveGroups.categoryId))
    .where(
      and(
        inArray(industryActivityProducts.activityId, ACTIVITY_IDS),
        eq(eveTypes.published, true),
      ),
    );
  const products = pickByBlueprint(productRows);

  // (b) Per-blueprint cost basis + confidence shortfall counts, in one GROUP BY
  // over the recursed flat materials left-joined to prices. The CASE rules
  // mirror priceConfidence exactly so the catalog's confidence matches the
  // detail page (high = priced ESI row, fresh, liquid; missing = no usable buy
  // price; stale/fallback/thin counted among priced rows). NULL best_buy lines
  // are excluded from cost, matching computeBuildCost.
  const costRows = await db
    .select({
      blueprintTypeId: blueprintFlatMaterials.blueprintTypeId,
      inputCost: sql<number>`COALESCE(SUM(CASE WHEN ${marketPrices.bestBuy} IS NOT NULL THEN ${marketPrices.bestBuy} * ${blueprintFlatMaterials.totalQuantity} ELSE 0 END), 0)`.mapWith(Number),
      total: sql<number>`COUNT(*)`.mapWith(Number),
      high: sql<number>`SUM(CASE WHEN ${marketPrices.bestBuy} IS NOT NULL AND ${marketPrices.staleAfter} > NOW() AND ${marketPrices.source} = 'esi' AND NOT (${marketPrices.buyVolume} IS NOT NULL AND ${marketPrices.buyVolume} < ${THIN_LIQUIDITY_UNITS}) THEN 1 ELSE 0 END)`.mapWith(Number),
      stale: sql<number>`SUM(CASE WHEN ${marketPrices.bestBuy} IS NOT NULL AND ${marketPrices.staleAfter} <= NOW() THEN 1 ELSE 0 END)`.mapWith(Number),
      fallback: sql<number>`SUM(CASE WHEN ${marketPrices.bestBuy} IS NOT NULL AND ${marketPrices.source} <> 'esi' THEN 1 ELSE 0 END)`.mapWith(Number),
      thin: sql<number>`SUM(CASE WHEN ${marketPrices.bestBuy} IS NOT NULL AND ${marketPrices.buyVolume} IS NOT NULL AND ${marketPrices.buyVolume} < ${THIN_LIQUIDITY_UNITS} THEN 1 ELSE 0 END)`.mapWith(Number),
      missing: sql<number>`SUM(CASE WHEN ${marketPrices.bestBuy} IS NULL THEN 1 ELSE 0 END)`.mapWith(Number),
    })
    .from(blueprintFlatMaterials)
    .leftJoin(marketPrices, eq(marketPrices.typeId, blueprintFlatMaterials.rawMaterialTypeId))
    .groupBy(blueprintFlatMaterials.blueprintTypeId);

  // (c) Product sell prices — one batched read for the revenue side.
  const productTypeIds = [...products.values()].map((p) => p.productTypeId);
  const productPrices = await getPrices([...new Set(productTypeIds)]);

  const catalog: CatalogRow[] = [];
  for (const cost of costRows) {
    const product = products.get(cost.blueprintTypeId);
    if (!product) continue; // unresolved or unpublished product → not browsable

    const productSell = productPrices.get(product.productTypeId)?.bestSell ?? null;
    const margin = computeMargin({
      buildCost: cost.inputCost,
      productSell,
      productQty: product.quantity,
    });
    const confidence = aggregateConfidenceFromCounts(cost);

    catalog.push({
      blueprintTypeId: cost.blueprintTypeId,
      productTypeId: product.productTypeId,
      name: product.name,
      categoryName: product.categoryName,
      activityId: product.activityId,
      inputCost: cost.inputCost,
      revenue: margin.revenue,
      margin: margin.margin,
      marginPct: margin.marginPct,
      confidence: confidence.level,
      confidenceSummary: confidence.summary,
    });
  }
  return catalog;
}

// Distinct SDE categories among buildable products — drives the Category
// FilterBar. SDE-only (no prices), so the chrome hole reads it without waiting
// on the catalog data hole.
export async function getCatalogCategories(): Promise<string[]> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);

  const rows = await db
    .selectDistinct({ name: eveCategories.name })
    .from(industryActivityProducts)
    .innerJoin(eveTypes, eq(eveTypes.id, industryActivityProducts.productTypeId))
    .innerJoin(eveGroups, eq(eveGroups.id, eveTypes.groupId))
    .innerJoin(eveCategories, eq(eveCategories.id, eveGroups.categoryId))
    .where(
      and(
        inArray(industryActivityProducts.activityId, ACTIVITY_IDS),
        eq(eveTypes.published, true),
      ),
    );
  return rows.map((r) => r.name).sort((a, b) => a.localeCompare(b));
}

// One blueprint's DIRECT inputs (one production level), priced for a fanned
// cascade column. Cached `'hours'` + the prices tag so re-fanning the same
// blueprint is a cache hit; reads prices via getPrices only — NO refresh. The
// confidence verdict is left to the client (raw signals carried on each row),
// so this stays clock-free. `null` when the blueprint has no resolved product.
export async function getBlueprintDirectInputs(
  blueprintTypeId: number,
): Promise<DirectInputsView | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(PRICES_FRESHNESS_TAG, BLUEPRINT_STRUCTURE_TAG);

  // Chosen activity + product for this blueprint (prefer manufacturing).
  const productRows = await db
    .select({
      activityId: industryActivityProducts.activityId,
      productTypeId: industryActivityProducts.productTypeId,
      productName: eveTypes.name,
    })
    .from(industryActivityProducts)
    .innerJoin(eveTypes, eq(eveTypes.id, industryActivityProducts.productTypeId))
    .where(
      and(
        eq(industryActivityProducts.blueprintTypeId, blueprintTypeId),
        inArray(industryActivityProducts.activityId, ACTIVITY_IDS),
      ),
    );
  if (productRows.length === 0) return null;
  productRows.sort((a, b) => a.activityId - b.activityId);
  const chosen = productRows[0];

  // Direct inputs for the chosen activity.
  const materials = await db
    .select({
      materialTypeId: industryActivityMaterials.materialTypeId,
      quantity: industryActivityMaterials.quantity,
    })
    .from(industryActivityMaterials)
    .where(
      and(
        eq(industryActivityMaterials.blueprintTypeId, blueprintTypeId),
        eq(industryActivityMaterials.activityId, chosen.activityId),
      ),
    );
  if (materials.length === 0) {
    return {
      blueprintTypeId,
      productTypeId: chosen.productTypeId,
      productName: chosen.productName,
      rows: [],
    };
  }

  const materialTypeIds = materials.map((m) => m.materialTypeId);

  // Which inputs are themselves buildable, and by which blueprint (the next
  // fan-out key) — one batched lookup, prefer manufacturing.
  const producerRows = await db
    .select({
      blueprintTypeId: industryActivityProducts.blueprintTypeId,
      activityId: industryActivityProducts.activityId,
      productTypeId: industryActivityProducts.productTypeId,
    })
    .from(industryActivityProducts)
    .innerJoin(eveTypes, eq(eveTypes.id, industryActivityProducts.productTypeId))
    .where(
      and(
        inArray(industryActivityProducts.productTypeId, materialTypeIds),
        inArray(industryActivityProducts.activityId, ACTIVITY_IDS),
        // Match getBlueprintCatalog's published guard so a ▸ never fans into an
        // unpublished/removed item the catalog itself would never list.
        eq(eveTypes.published, true),
      ),
    );
  // productTypeId → producing blueprint, preferring the manufacturing producer.
  const producerByProduct = new Map<number, { blueprintTypeId: number; activityId: number }>();
  for (const r of producerRows) {
    const existing = producerByProduct.get(r.productTypeId);
    if (!existing || r.activityId < existing.activityId) {
      producerByProduct.set(r.productTypeId, {
        blueprintTypeId: r.blueprintTypeId,
        activityId: r.activityId,
      });
    }
  }

  const [labels, priceMap] = await Promise.all([
    getTypeLabels(materialTypeIds),
    getPrices(materialTypeIds),
  ]);

  const rows: DirectInputRow[] = materials.map((m) => {
    const price = priceMap.get(m.materialTypeId);
    const unitBuy = price?.bestBuy ?? null;
    const childBlueprintTypeId = producerByProduct.get(m.materialTypeId)?.blueprintTypeId ?? null;
    return {
      typeId: m.materialTypeId,
      name: labels.get(m.materialTypeId)?.name ?? `Type ${m.materialTypeId}`,
      quantity: m.quantity,
      unitBuy,
      extendedCost: unitBuy === null ? null : unitBuy * m.quantity,
      source: price?.source ?? null,
      buyVolume: price?.buyVolume == null ? null : Number(price.buyVolume),
      staleAfterMs: price ? price.staleAfter.getTime() : null,
      buildable: childBlueprintTypeId !== null,
      childBlueprintTypeId,
    };
  });

  // Most expensive inputs first (nulls last) — the at-a-glance "where the cost
  // is" order. Deeper columns aren't independently URL-sortable.
  rows.sort((a, b) => {
    if (a.extendedCost === null && b.extendedCost === null) return 0;
    if (a.extendedCost === null) return 1;
    if (b.extendedCost === null) return -1;
    return b.extendedCost - a.extendedCost;
  });

  return {
    blueprintTypeId,
    productTypeId: chosen.productTypeId,
    productName: chosen.productName,
    rows,
  };
}
