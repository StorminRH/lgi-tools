import { cacheLife, cacheTag } from 'next/cache';
import { BLUEPRINT_STRUCTURE_TAG } from '@/data/eve-data/constants';
import {
  getActivityByBlueprint,
  getBlueprintOutput,
  getBlueprintSearchRows,
  getBlueprintTree,
  getFlatMaterials,
  getTypeLabels,
} from '@/data/eve-data/queries';
import { computeHeights, type TreeNode } from '@/data/eve-data/tree-resolver';
import { PRICES_FRESHNESS_TAG } from '@/data/market-prices/cache';
import { getPrices } from '@/data/market-prices/queries';
import {
  assemblePricing,
  collectIntermediateTypeIds,
  type PriceLite,
} from './build-pricing';
import { toBuildTree } from './build-tree';
import { classifyRaw } from './industry-styles';
import type {
  BlueprintIndexEntry,
  BlueprintPricing,
  BlueprintStructure,
} from './types';

// The industry-planner feature is the composition layer that sits ABOVE the
// eve-data, market-prices, and industry-math data slices — the one place
// allowed to join them (feature → data is permitted; data ⊥ data is not). The
// pure margin math lives in industry-math; everything here is glue + caching.

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

// Every blueprint that produces a buildable anywhere in the tree, deduped — so
// we can fetch each one's activity (manufacturing vs reaction) in one query.
function collectBlueprintIds(nodes: TreeNode[], acc: Set<number> = new Set()): Set<number> {
  for (const node of nodes) {
    if (node.producedBy) acc.add(node.producedBy.blueprintTypeId);
    if (node.inputs.length > 0) collectBlueprintIds(node.inputs, acc);
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
  // if both somehow exist. No product ⇒ not a manufacturable/reaction blueprint
  // ⇒ no planner page.
  const chosen = await getBlueprintOutput(blueprintId);
  if (!chosen) return null;

  const [treeResult, flat] = await Promise.all([
    getBlueprintTree(blueprintId),
    getFlatMaterials(blueprintId),
  ]);
  const tree = treeResult?.treeJson ?? [];

  const labelIds = uniq([
    chosen.productTypeId,
    ...flat.map((f) => f.rawMaterialTypeId),
    ...collectTreeTypeIds(tree),
  ]);
  const [labels, activityByBlueprint] = await Promise.all([
    getTypeLabels(labelIds),
    getActivityByBlueprint([...collectBlueprintIds(tree)]),
  ]);
  const materialNames: Record<number, string> = {};
  for (const [id, l] of labels) materialNames[id] = l.name;

  // Bucket each raw leaf into its source category, and remember the categories'
  // display order + colour so the priced ledger can render ordered sections.
  const materialCategory: Record<number, string> = {};
  const seenCategory = new Map<string, { tone: BlueprintStructure['materialCategories'][number]['tone']; order: number }>();
  for (const f of flat) {
    const l = labels.get(f.rawMaterialTypeId);
    const cat = classifyRaw(l?.groupName ?? '', l?.categoryName ?? '');
    materialCategory[f.rawMaterialTypeId] = cat.label;
    seenCategory.set(cat.label, { tone: cat.tone, order: cat.order });
  }
  const materialCategories = [...seenCategory.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([label, c]) => ({ label, tone: c.tone }));

  const { buildTree, buildNodeDisplay, rootHeight } = toBuildTree({
    tree,
    labels,
    heights: computeHeights(tree),
    activityByBlueprint,
    product: {
      typeId: chosen.productTypeId,
      quantityPerRun: chosen.quantity,
      activityId: chosen.activityId,
    },
  });

  return {
    blueprintTypeId: blueprintId,
    activityId: chosen.activityId,
    product: {
      typeId: chosen.productTypeId,
      name: materialNames[chosen.productTypeId] ?? `Type ${chosen.productTypeId}`,
      quantityPerRun: chosen.quantity,
    },
    tree,
    buildTree,
    buildNodeDisplay,
    rootHeight,
    flatMaterials: flat.map((f) => ({
      typeId: f.rawMaterialTypeId,
      quantity: Number(f.totalQuantity),
    })),
    materialCategory,
    materialCategories,
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

  // Raw materials (the cost basis) + the product + every buildable intermediate
  // shown in the cascade. Intermediates are priced only to badge confidence on
  // their rows (build-vs-buy hint) — they're never summed into cost. Still ONE
  // batched query across the whole set.
  const priceIds = uniq([
    ...structure.flatMaterials.map((m) => m.typeId),
    structure.product.typeId,
    ...collectIntermediateTypeIds(structure.buildTree, structure.buildNodeDisplay),
  ]);
  const priceMap = await getPrices(priceIds); // single WHERE type_id IN (...)

  // Same assembler the client uses after an on-demand refresh, so the streamed
  // figure and the refreshed figure are computed identically.
  return assemblePricing(structure, (typeId): PriceLite | undefined => {
    const p = priceMap.get(typeId);
    if (!p) return undefined;
    return {
      bestBuy: p.bestBuy,
      bestSell: p.bestSell,
      pct5Buy: p.pct5Buy,
      pct5Sell: p.pct5Sell,
      buyVolume: p.buyVolume === null ? null : Number(p.buyVolume),
      sellVolume: p.sellVolume === null ? null : Number(p.sellVolume),
      source: p.source,
      staleAfterMs: p.staleAfter.getTime(),
    };
  });
}

// Compact search index: one entry per blueprint, labelled by the published
// item it produces. Cached `'max'` (deploy-static, SDE-tagged). Fetched once by
// the lazy Blueprints search source on the client's first blueprint keystroke,
// so the ~5k-entry index never rides the initial bundle. Filtering to published
// products also drops the degenerate self-recipe junk (those produce
// unpublished types).
export async function getBlueprintSearchIndex(): Promise<BlueprintIndexEntry[]> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);

  const rows = await getBlueprintSearchRows();

  // One entry per blueprint; prefer the manufacturing product (lower activity
  // id) if a blueprint somehow carries both.
  const byBlueprint = new Map<
    number,
    { name: string; activityId: number; productTypeId: number }
  >();
  for (const r of rows) {
    const existing = byBlueprint.get(r.blueprintTypeId);
    if (!existing || r.activityId < existing.activityId) {
      byBlueprint.set(r.blueprintTypeId, {
        name: r.name,
        activityId: r.activityId,
        productTypeId: r.productTypeId,
      });
    }
  }
  return [...byBlueprint.entries()]
    .map(([blueprintTypeId, v]) => ({
      blueprintTypeId,
      productTypeId: v.productTypeId,
      name: v.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
