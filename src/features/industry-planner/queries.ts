import { cacheLife, cacheTag } from 'next/cache';
import {
  DOGMA_ATTR_MANUFACTURE_TIME_PER_LEVEL,
  SDE_CACHE_TAG,
} from '@/data/eve-data/constants';
import {
  getActivityByBlueprint,
  getBlueprintActivities,
  getBlueprintActivityTimes,
  getBlueprintOutput,
  getBlueprintSearchRows,
  getBlueprintTree,
  getIndustryTargetFilters,
  getTypeAttributesBatch,
  getTypeLabels,
  getTypeNames,
  type TypeLabel,
} from '@/data/eve-data/queries';
import { matchingFilterIds, type TargetFilter } from '@/data/eve-data/structures';
import { computeHeights } from '@/data/eve-data/tree-resolver';
import { isRenderableCategory } from '@/data/eve-data/type-images';
import type { TreeNode } from '@/data/eve-data/types';
import { getSystemCostIndicesOnView } from '@/data/industry-indices/on-view';
import { INDUSTRY_INDICES_TAG } from '@/data/industry-indices/keys';
import { getAdjustedPrices } from '@/data/industry-indices/queries';
import { MARKET_PRICES_TAG } from '@/data/market-prices/keys';
import { toClientPrice } from '@/data/market-prices/narrow';
import { getPrices } from '@/data/market-prices/queries';
import { dedupe } from '@/lib/array';
import { unresolvedName } from '@/lib/format/names';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { collectBlueprintTypeIds, collectRawTypeIds, productTypeByBlueprint } from './build-batch';
import { assemblePricing, pricedTypeIds } from './build-pricing';
import { toBuildTree } from './build-tree';
import { classifyRaw } from './industry-styles';
import type {
  BlueprintIndexEntry,
  BlueprintPricing,
  BlueprintStructure,
  SystemJobCostIndex,
  TypeAdjustedPrice,
} from './types';

function collectTreeTypeIds(nodes: TreeNode[], acc: number[] = []): number[] {
  for (const node of nodes) {
    acc.push(node.typeId);
    if (node.inputs.length > 0) collectTreeTypeIds(node.inputs, acc);
  }
  return acc;
}

function bucketRawCategories(
  rawTypeIds: number[],
  labels: Map<number, TypeLabel>,
): Pick<BlueprintStructure, 'materialCategory' | 'materialCategories'> {
  const materialCategory: Record<number, string> = {};
  const seenCategory = new Map<
    string,
    { tone: BlueprintStructure['materialCategories'][number]['tone']; order: number }
  >();
  for (const rawTypeId of rawTypeIds) {
    const l = labels.get(rawTypeId);
    const cat = classifyRaw(l?.groupName ?? '', l?.categoryName ?? '');
    materialCategory[rawTypeId] = cat.label;
    seenCategory.set(cat.label, { tone: cat.tone, order: cat.order });
  }
  const materialCategories = [...seenCategory.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([label, c]) => ({ label, tone: c.tone }));
  return { materialCategory, materialCategories };
}

async function nodeTimeSkillsFor(
  blueprintTypeIds: number[],
): Promise<BlueprintStructure['nodeTimeSkills']> {
  const activitySets = await getBlueprintActivities(blueprintTypeIds);
  const requiredByBlueprint = new Map<number, { typeId: number; level: number }[]>();
  const skillIds = new Set<number>();
  for (const [bp, set] of activitySets) {
    const manufacturing = set.find((activity) => activity.name === 'manufacturing');
    if (manufacturing === undefined || manufacturing.skills.length === 0) continue;
    requiredByBlueprint.set(bp, manufacturing.skills);
    for (const skill of manufacturing.skills) skillIds.add(skill.typeId);
  }
  const [skillAttrs, skillNames] = await Promise.all([
    getTypeAttributesBatch([...skillIds]),
    getTypeNames([...skillIds]),
  ]);
  const nodeTimeSkills: BlueprintStructure['nodeTimeSkills'] = {};
  for (const [bp, skills] of requiredByBlueprint) {
    const timeSkills = skills.flatMap((skill) => {
      const pct = skillAttrs.get(skill.typeId)?.[DOGMA_ATTR_MANUFACTURE_TIME_PER_LEVEL];
      return typeof pct === 'number' && pct !== 0
        ? [
            {
              skillTypeId: skill.typeId,
              skillName: skillNames.get(skill.typeId) ?? unresolvedName('skill', skill.typeId),
              timePctPerLevel: pct,
            },
          ]
        : [];
    });
    if (timeSkills.length > 0) nodeTimeSkills[bp] = timeSkills;
  }
  return nodeTimeSkills;
}

export async function getBlueprintStructure(
  blueprintId: number,
): Promise<BlueprintStructure | null> {
  'use cache';
  cacheLife('max');
  cacheTag(SDE_CACHE_TAG);
  return withColdStartRetry(async () => {
    const chosen = await getBlueprintOutput(blueprintId);
    if (!chosen) return null;

    const treeResult = await getBlueprintTree(blueprintId);
    const tree = treeResult?.treeJson ?? [];
    const rawTypeIds = collectRawTypeIds(tree);

    const labelIds = dedupe([chosen.productTypeId, ...collectTreeTypeIds(tree)]);
    const blueprintIds = collectBlueprintTypeIds(tree, blueprintId);
    const [labels, activityByBlueprint, activityTimeMap, nodeTimeSkills, targetFilters] = await Promise.all([
      getTypeLabels(labelIds),
      getActivityByBlueprint(blueprintIds),
      getBlueprintActivityTimes(blueprintIds),
      nodeTimeSkillsFor(blueprintIds),
      getIndustryTargetFilters(),
    ]);
    const topJobSeconds = activityTimeMap.get(blueprintId) ?? null;
    const nodeJobSeconds: Record<number, number> = {};
    for (const [bp, secs] of activityTimeMap) nodeJobSeconds[bp] = secs;
    const nodeActivityByBlueprint: Record<number, number> = { [blueprintId]: chosen.activityId };
    for (const [bp, act] of activityByBlueprint) nodeActivityByBlueprint[bp] = act;
    const materialNames: Record<number, string> = {};
    for (const [id, l] of labels) materialNames[id] = l.name;

    const { materialCategory, materialCategories } = bucketRawCategories(rawTypeIds, labels);

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
        name: materialNames[chosen.productTypeId] ?? unresolvedName('type', chosen.productTypeId),
        quantityPerRun: chosen.quantity,
        renderable: isRenderableCategory(labels.get(chosen.productTypeId)?.categoryName ?? ''),
      },
      tree,
      buildTree,
      buildNodeDisplay,
      rootHeight,
      materialCategory,
      materialCategories,
      materialNames,
      topJobSeconds,
      nodeJobSeconds,
      nodeActivityByBlueprint,
      nodeFilterIds: nodeFilterIdsFor(
        productTypeByBlueprint(tree, { blueprintTypeId: blueprintId, productTypeId: chosen.productTypeId }),
        labels,
        targetFilters,
      ),
      nodeTimeSkills,
    };
  });
}

function nodeFilterIdsFor(
  productByBlueprint: ReadonlyMap<number, number>,
  labels: ReadonlyMap<number, TypeLabel>,
  filters: readonly TargetFilter[],
): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (const [bp, typeId] of productByBlueprint) {
    const label = labels.get(typeId);
    if (label) out[bp] = matchingFilterIds(filters, label);
  }
  return out;
}

/**
 * A blueprint's tree priced from the stored Forge order books, cached
 * across instances until a price write clears the tag. It only aggregates
 * stored prices (the planner's price request refreshes them), and every
 * price write clears MARKET_PRICES_TAG, so it lives until then rather than
 * until the earliest book in the tree expires, which a never-stored or
 * never-refreshed type would hold in the past for good.
 */
export async function getBlueprintPricing(
  blueprintId: number,
): Promise<BlueprintPricing | null> {
  'use cache: remote';
  cacheLife('max');
  cacheTag(MARKET_PRICES_TAG, SDE_CACHE_TAG);

  const structure = await getBlueprintStructure(blueprintId);
  if (!structure) return null;

  const priceMap = await getPrices(pricedTypeIds(structure));

  return assemblePricing(
    structure,
    (typeId) => {
      const p = priceMap.get(typeId);
      return p === undefined ? undefined : toClientPrice(p, p.staleAfter?.getTime() ?? null);
    },
    { basis: 'marginal' },
  );
}

export async function getBlueprintSearchIndex(): Promise<BlueprintIndexEntry[]> {
  'use cache';
  cacheLife('max');
  cacheTag(SDE_CACHE_TAG);

  const rows = await withColdStartRetry(() => getBlueprintSearchRows());

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

/**
 * The adjusted price of every type a job in the build consumes, nested inputs
 * included, so each job's fee is valued on its own inputs. They depend on the
 * blueprint alone. They are stored rows only, refreshed by the daily
 * cron:industry-indices, and every write clears INDUSTRY_INDICES_TAG, so the
 * entry lives across instances until then. Types CCP gives no adjusted price
 * are left out, and an unknown blueprint has none.
 */
export async function getBlueprintAdjustedPrices(blueprintId: number): Promise<TypeAdjustedPrice[]> {
  'use cache: remote';
  cacheLife('max');
  cacheTag(INDUSTRY_INDICES_TAG, SDE_CACHE_TAG);

  const structure = await getBlueprintStructure(blueprintId);
  if (!structure) return [];
  const adjusted = await withColdStartRetry(() => getAdjustedPrices(dedupe(collectTreeTypeIds(structure.tree))));
  return [...adjusted].map(([typeId, adjustedPrice]) => ({ typeId, adjustedPrice }));
}

/** Each system's manufacturing and reaction cost indices, in the order asked. */
export async function getJobCostIndices(systemIds: number[]): Promise<SystemJobCostIndex[]> {
  const ids = dedupe(systemIds);
  const indices = await getSystemCostIndicesOnView(ids);
  return ids.map((systemId) => ({
    systemId,
    manufacturing: indices.get(systemId)?.get('manufacturing') ?? null,
    reaction: indices.get(systemId)?.get('reaction') ?? null,
  }));
}
