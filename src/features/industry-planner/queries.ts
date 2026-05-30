import { and, eq, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { eveTypes, industryActivityProducts } from '@/db/schema';
import { BLUEPRINT_STRUCTURE_TAG, INDUSTRY_ACTIVITY_IDS } from '@/data/eve-data/constants';
import {
  getBlueprintTree,
  getFlatMaterials,
  getTypeLabels,
  type TypeLabel,
} from '@/data/eve-data/queries';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import { PRICES_FRESHNESS_TAG } from '@/data/market-prices/cache';
import { getPrices } from '@/data/market-prices/queries';
import { assemblePricing, type PriceLite } from './build-pricing';
import { classifyBuildable, classifyRaw } from './industry-styles';
import type {
  BlueprintIndexEntry,
  BlueprintPricing,
  BlueprintStructure,
  BomGroup,
  BomItem,
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

// One run's direct recipe of a buildable: its per-run yield and the immediate
// ingredients it consumes per run. Stable across parents, so the first
// occurrence in the tree is representative.
type Recipe = { quantityPerRun: number; inputs: { typeId: number; perRun: number }[] };

// Gross demand for every buildable in the tree (total units needed across the
// whole build) plus each buildable's recipe. A node's absolute quantity is its
// per-parent-run need times the parent's runs; its own runs are that absolute
// quantity over its per-run yield. Leaves are raw materials (priced
// separately), so only `producedBy` nodes are accumulated.
function walkBom(
  nodes: TreeNode[],
  parentRuns: number,
  demand: Map<number, number>,
  recipes: Map<number, Recipe>,
): void {
  for (const node of nodes) {
    const absQty = node.quantity * parentRuns;
    if (!node.producedBy) continue;
    demand.set(node.typeId, (demand.get(node.typeId) ?? 0) + absQty);
    if (!recipes.has(node.typeId)) {
      recipes.set(node.typeId, {
        quantityPerRun: node.producedBy.quantityPerRun,
        inputs: node.inputs.map((c) => ({ typeId: c.typeId, perRun: c.quantity })),
      });
    }
    walkBom(node.inputs, absQty / node.producedBy.quantityPerRun, demand, recipes);
  }
}

// Build the condensed bill of materials: each buildable once at its gross
// demand, grouped by construction category and expandable to the direct inputs
// that produce that quantity. The final product is seeded as the top buildable
// (recipe = the tree's roots) so its category (e.g. the hull) shows too.
function toBuildGroups(
  tree: TreeNode[],
  labels: Map<number, TypeLabel>,
  product: { typeId: number; quantityPerRun: number },
): BomGroup[] {
  if (tree.length === 0) return [];

  const demand = new Map<number, number>();
  const recipes = new Map<number, Recipe>();
  walkBom(tree, 1, demand, recipes);
  demand.set(product.typeId, product.quantityPerRun);
  recipes.set(product.typeId, {
    quantityPerRun: product.quantityPerRun,
    inputs: tree.map((n) => ({ typeId: n.typeId, perRun: n.quantity })),
  });

  const groups = new Map<string, { tone: BomGroup['tone']; order: number; items: BomItem[] }>();
  for (const [typeId, gross] of demand) {
    const label = labels.get(typeId);
    const cat = classifyBuildable(label?.groupName ?? '');
    const recipe = recipes.get(typeId);
    const runs = recipe && recipe.quantityPerRun ? gross / recipe.quantityPerRun : 0;
    const inputs = (recipe?.inputs ?? [])
      .map((inp) => {
        const il = labels.get(inp.typeId);
        // An input is itself a buildable (in the demand map) or a raw leaf.
        const ic = demand.has(inp.typeId)
          ? classifyBuildable(il?.groupName ?? '')
          : classifyRaw(il?.groupName ?? '', il?.categoryName ?? '');
        return {
          typeId: inp.typeId,
          name: il?.name ?? `Type ${inp.typeId}`,
          quantity: Math.round(inp.perRun * runs),
          tone: ic.tone,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const group = groups.get(cat.label) ?? { tone: cat.tone, order: cat.order, items: [] };
    group.items.push({ typeId, name: label?.name ?? `Type ${typeId}`, quantity: Math.round(gross), inputs });
    groups.set(cat.label, group);
  }

  return [...groups.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([label, g]) => ({
      label,
      tone: g.tone,
      items: g.items.sort((a, b) => a.name.localeCompare(b.name)),
    }));
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

  const labelIds = uniq([
    chosen.productTypeId,
    ...flat.map((f) => f.rawMaterialTypeId),
    ...collectTreeTypeIds(tree),
  ]);
  const labels = await getTypeLabels(labelIds);
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

  return {
    blueprintTypeId: blueprintId,
    activityId: chosen.activityId,
    product: {
      typeId: chosen.productTypeId,
      name: materialNames[chosen.productTypeId] ?? `Type ${chosen.productTypeId}`,
      quantityPerRun: chosen.quantity,
    },
    tree,
    buildGroups: toBuildGroups(tree, labels, {
      typeId: chosen.productTypeId,
      quantityPerRun: chosen.quantity,
    }),
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

  const priceIds = uniq([
    ...structure.flatMaterials.map((m) => m.typeId),
    structure.product.typeId,
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

  const rows = await db
    .select({
      blueprintTypeId: industryActivityProducts.blueprintTypeId,
      activityId: industryActivityProducts.activityId,
      name: eveTypes.name,
    })
    .from(industryActivityProducts)
    .innerJoin(eveTypes, eq(eveTypes.id, industryActivityProducts.productTypeId))
    .where(
      and(
        inArray(industryActivityProducts.activityId, ACTIVITY_IDS),
        eq(eveTypes.published, true),
      ),
    );

  // One entry per blueprint; prefer the manufacturing product (lower activity
  // id) if a blueprint somehow carries both.
  const byBlueprint = new Map<number, { name: string; activityId: number }>();
  for (const r of rows) {
    const existing = byBlueprint.get(r.blueprintTypeId);
    if (!existing || r.activityId < existing.activityId) {
      byBlueprint.set(r.blueprintTypeId, { name: r.name, activityId: r.activityId });
    }
  }
  return [...byBlueprint.entries()]
    .map(([blueprintTypeId, v]) => ({ blueprintTypeId, name: v.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
