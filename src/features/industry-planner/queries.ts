import { and, eq, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { industryActivityProducts } from '@/db/schema';
import { BLUEPRINT_STRUCTURE_TAG, INDUSTRY_ACTIVITY_IDS } from '@/data/eve-data/constants';
import {
  getBlueprintTree,
  getFlatMaterials,
  getTypesByIds,
} from '@/data/eve-data/queries';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import { PRICES_FRESHNESS_TAG } from '@/data/market-prices/cache';
import { getPrices } from '@/data/market-prices/queries';
import {
  computeBuildCost,
  computeMargin,
  type PriceOf,
} from '@/data/industry-math/profitability';
import type {
  BlueprintPricing,
  BlueprintStructure,
  MaterialCostRow,
} from './types';

// The industry-planner feature is the composition layer that sits ABOVE the
// eve-data, market-prices, and industry-math data slices — the one place
// allowed to join them (feature → data is permitted; data ⊥ data is not). The
// pure margin math lives in industry-math; everything here is glue + caching.

const ACTIVITY_IDS = Array.from(INDUSTRY_ACTIVITY_IDS);

function uniq(ids: number[]): number[] {
  return [...new Set(ids)];
}

// Every type ID referenced anywhere in the nested tree (for labelling nodes).
function collectTreeTypeIds(nodes: TreeNode[], acc: number[] = []): number[] {
  for (const node of nodes) {
    acc.push(node.typeId);
    if (node.inputs.length > 0) collectTreeTypeIds(node.inputs, acc);
  }
  return acc;
}

// Deploy-static blueprint structure: the nested tree, the flattened raw
// materials (cost basis), and names for everything. No price dependency, so it
// renders in the static shell. Cached `'max'` (build ID drops it on deploy,
// which covers deploy-time SDE ingest) and tagged so the weekly drift cron can
// bust it after a no-deploy re-ingest. Warm loads hit the cache → no DB query.
export async function getBlueprintStructure(
  blueprintId: number,
): Promise<BlueprintStructure | null> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);

  // Which item does this blueprint produce, and how many per run? A blueprint
  // has at most one of manufacturing (1) / reaction (11); prefer manufacturing
  // if both somehow exist. No product row ⇒ not a manufacturable/reaction
  // blueprint ⇒ no planner page.
  const productRows = await db
    .select({
      productTypeId: industryActivityProducts.productTypeId,
      quantity: industryActivityProducts.quantity,
      activityId: industryActivityProducts.activityId,
    })
    .from(industryActivityProducts)
    .where(
      and(
        eq(industryActivityProducts.blueprintTypeId, blueprintId),
        inArray(industryActivityProducts.activityId, ACTIVITY_IDS),
      ),
    );
  if (productRows.length === 0) return null;
  productRows.sort((a, b) => a.activityId - b.activityId);
  const chosen = productRows[0];

  const [treeResult, flat] = await Promise.all([
    getBlueprintTree(blueprintId),
    getFlatMaterials(blueprintId),
  ]);
  const tree = treeResult?.treeJson ?? [];

  const nameIds = uniq([
    chosen.productTypeId,
    ...flat.map((f) => f.rawMaterialTypeId),
    ...collectTreeTypeIds(tree),
  ]);
  const types = await getTypesByIds(nameIds);
  const materialNames: Record<number, string> = {};
  for (const t of types) materialNames[t.id] = t.name;

  return {
    blueprintTypeId: blueprintId,
    activityId: chosen.activityId,
    product: {
      typeId: chosen.productTypeId,
      name: materialNames[chosen.productTypeId] ?? `Type ${chosen.productTypeId}`,
      quantityPerRun: chosen.quantity,
    },
    tree,
    flatMaterials: flat.map((f) => ({
      typeId: f.rawMaterialTypeId,
      quantity: Number(f.totalQuantity),
    })),
    materialNames,
  };
}

// Priced cost panel: flat materials × live prices + margin. One batched price
// query across all materials + the product (never per-material in a loop).
// Cached `'hours'` + the prices freshness tag, so the cron's revalidate keeps
// it fresh; the client tops up any null/stale rows on demand. Returns null only
// when the blueprint itself doesn't resolve (page already handled that via the
// structure read).
export async function getBlueprintPricing(
  blueprintId: number,
): Promise<BlueprintPricing | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(PRICES_FRESHNESS_TAG);

  const structure = await getBlueprintStructure(blueprintId); // cache hit — no extra DB
  if (!structure) return null;

  const priceIds = uniq([
    ...structure.flatMaterials.map((m) => m.typeId),
    structure.product.typeId,
  ]);
  const priceMap = await getPrices(priceIds); // single WHERE type_id IN (...)

  const priceOf: PriceOf = (typeId) => {
    const p = priceMap.get(typeId);
    return p ? { bestBuy: p.bestBuy, bestSell: p.bestSell } : undefined;
  };

  const buildCost = computeBuildCost(structure.flatMaterials, priceOf);
  const productPrice = priceMap.get(structure.product.typeId);
  const margin = computeMargin({
    buildCost: buildCost.total,
    productSell: productPrice?.bestSell ?? null,
    productQty: structure.product.quantityPerRun,
  });

  const rows: MaterialCostRow[] = buildCost.perMaterial.map((c) => {
    const p = priceMap.get(c.typeId);
    return {
      typeId: c.typeId,
      name: structure.materialNames[c.typeId] ?? `Type ${c.typeId}`,
      quantity: c.quantity,
      unitBuy: c.unitBuy,
      extendedCost: c.extendedCost,
      bestSell: p?.bestSell ?? null,
      pct5Buy: p?.pct5Buy ?? null,
      pct5Sell: p?.pct5Sell ?? null,
      updatedAtMs: p ? p.updatedAt.getTime() : null,
    };
  });

  return {
    rows,
    product: {
      typeId: structure.product.typeId,
      name: structure.product.name,
      quantityPerRun: structure.product.quantityPerRun,
      bestSell: productPrice?.bestSell ?? null,
      updatedAtMs: productPrice ? productPrice.updatedAt.getTime() : null,
    },
    summary: {
      inputCost: buildCost.total,
      revenue: margin.revenue,
      margin: margin.margin,
      marginPct: margin.marginPct,
      incomplete:
        buildCost.missingTypeIds.length > 0 ||
        (productPrice?.bestSell ?? null) === null,
    },
  };
}
