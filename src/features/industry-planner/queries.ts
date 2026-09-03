import { cacheLife, cacheTag } from 'next/cache';
import {
  BLUEPRINT_STRUCTURE_TAG,
  DOGMA_ATTR_MANUFACTURE_TIME_PER_LEVEL,
} from '@/data/eve-data/constants';
import {
  getActivityByBlueprint,
  getBlueprintActivities,
  getBlueprintActivityTimes,
  getBlueprintOutput,
  getBlueprintSearchRows,
  getBlueprintTree,
  getIndustryStationsForSystem,
  getTypeAttributesBatch,
  getTypeLabels,
  getTypeNames,
  type TypeLabel,
} from '@/data/eve-data/queries';
import { computeHeights, type TreeNode } from '@/data/eve-data/tree-resolver';
import { isRenderableCategory } from '@/data/eve-data/type-images';
import { getAdjustedPrices, getSystemCostIndices } from '@/data/industry-indices/queries';
import { PRICES_FRESHNESS_TAG } from '@/data/market-prices/cache';
import { toPlainPriceFigures } from '@/data/market-prices/narrow';
import { getPrices } from '@/data/market-prices/queries';
import { dedupe } from '@/lib/array';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { collectRawTypeIds } from './build-batch';
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
  BuildLocationData,
} from './types';

function collectTreeTypeIds(nodes: TreeNode[], acc: number[] = []): number[] {
  for (const node of nodes) {
    acc.push(node.typeId);
    if (node.inputs.length > 0) collectTreeTypeIds(node.inputs, acc);
  }
  return acc;
}

function collectBlueprintIds(nodes: TreeNode[], acc: Set<number> = new Set()): Set<number> {
  for (const node of nodes) {
    if (node.producedBy) acc.add(node.producedBy.blueprintTypeId);
    if (node.inputs.length > 0) collectBlueprintIds(node.inputs, acc);
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
              skillName: skillNames.get(skill.typeId) ?? `Skill ${skill.typeId}`,
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
  cacheTag(BLUEPRINT_STRUCTURE_TAG);
  return withColdStartRetry(async () => {
    const chosen = await getBlueprintOutput(blueprintId);
    if (!chosen) return null;

    const treeResult = await getBlueprintTree(blueprintId);
    const tree = treeResult?.treeJson ?? [];
    const rawTypeIds = collectRawTypeIds(tree);

    const labelIds = dedupe([chosen.productTypeId, ...collectTreeTypeIds(tree)]);
    const blueprintIds = collectBlueprintIds(tree);
    const [labels, activityByBlueprint, activityTimeMap, nodeTimeSkills] = await Promise.all([
      getTypeLabels(labelIds),
      getActivityByBlueprint([...blueprintIds]),
      getBlueprintActivityTimes([blueprintId, ...blueprintIds]),
      nodeTimeSkillsFor([blueprintId, ...blueprintIds]),
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
        name: materialNames[chosen.productTypeId] ?? `Type ${chosen.productTypeId}`,
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
      nodeTimeSkills,
    };
  });
}

export async function getBlueprintPricing(
  blueprintId: number,
): Promise<BlueprintPricing | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(PRICES_FRESHNESS_TAG, BLUEPRINT_STRUCTURE_TAG);

  const structure = await getBlueprintStructure(blueprintId);
  if (!structure) return null;

  const priceIds = dedupe([
    ...collectRawTypeIds(structure.tree),
    structure.product.typeId,
    ...collectIntermediateTypeIds(structure.buildTree, structure.buildNodeDisplay),
  ]);
  const priceMap = await getPrices(priceIds);

  return assemblePricing(
    structure,
    (typeId): PriceLite | undefined => {
      const p = priceMap.get(typeId);
      if (!p) return undefined;
      return {
        ...toPlainPriceFigures(p),
        source: p.source,
        staleAfterMs: p.staleAfter.getTime(),
      };
    },
    { basis: 'marginal' },
  );
}

export async function getBlueprintSearchIndex(): Promise<BlueprintIndexEntry[]> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);

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

export async function getBuildLocation(
  systemId: number,
  blueprintId: number,
): Promise<BuildLocationData> {
  const structure = await getBlueprintStructure(blueprintId);

  const baseTypeIds = dedupe(
    structure?.buildTree[0]?.inputs.map((i) => i.typeId) ?? [],
  );

  const [stations, costIndices, adjustedMap] = await Promise.all([
    getIndustryStationsForSystem(systemId),
    getSystemCostIndices(systemId),
    getAdjustedPrices(baseTypeIds),
  ]);

  return {
    stations,
    costIndices: {
      manufacturing: costIndices.get('manufacturing') ?? null,
      reaction: costIndices.get('reaction') ?? null,
    },
    adjustedPrices: [...adjustedMap.entries()].map(([typeId, adjustedPrice]) => ({
      typeId,
      adjustedPrice,
    })),
  };
}
