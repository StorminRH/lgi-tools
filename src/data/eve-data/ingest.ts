import { sql } from 'drizzle-orm';
import type { PostgresJsDb } from '@/lib/db-types';
import {
  blueprintFlatMaterials,
  blueprintTrees,
  dgmAttributeTypes,
  eveCategories,
  eveGroups,
  eveTypes,
  industryBlueprints,
  typeDogma,
} from './schema';
import {
  downloadSdeJsonl,
  cleanupSdeJsonl,
  type SdeJsonlPaths,
} from './source';
import { isBlueprintActivitiesDocument } from './activities';
import { boolOf, dogmaAttributePairs, intOrNull, localizedEn, numOrNull, strOrNull } from './coerce';
import { emitIndustryRules, parseIndustryRules } from './industry-rules';
import { makeBatchInserter, streamJsonl } from './sde-io';
import { emitUniverseNeon, parseUniverse } from './universe';

export type IngestSummary = {
  categoriesWritten: number;
  groupsWritten: number;
  typesWritten: number;
  attributeTypesWritten: number;
  typeDogmaWritten: number;
  blueprintsWritten: number;
  regionsWritten: number;
  constellationsWritten: number;
  systemsWritten: number;
  systemJumpsWritten: number;
  stationOperationsWritten: number;
  npcStationsWritten: number;
  targetFiltersWritten: number;
  industryModifiersWritten: number;
  assemblyLinesWritten: number;
  installationTypesWritten: number;
  durationMs: number;
};

export type IngestOptions = {
  keepCache?: boolean;
};

const BATCH_SIZE = 500;

async function streamInsert<T extends Record<string, unknown>>(
  path: string,
  mapRow: (row: Record<string, unknown>) => T | null,
  flush: (batch: T[]) => Promise<void>,
): Promise<number> {
  const inserter = makeBatchInserter(BATCH_SIZE, flush);
  for await (const row of streamJsonl(path)) {
    const mapped = mapRow(row);
    if (mapped) await inserter.add([mapped]);
  }
  await inserter.flush();
  return inserter.written();
}

export async function runIngest(
  db: PostgresJsDb,
  opts: IngestOptions = {},
): Promise<IngestSummary> {
  const start = Date.now();
  const paths: SdeJsonlPaths = await downloadSdeJsonl();

  const universe = await parseUniverse(paths);
  const industryRules = await parseIndustryRules(paths);

  const summary: IngestSummary = {
    categoriesWritten: 0,
    groupsWritten: 0,
    typesWritten: 0,
    attributeTypesWritten: 0,
    typeDogmaWritten: 0,
    blueprintsWritten: 0,
    regionsWritten: 0,
    constellationsWritten: 0,
    systemsWritten: 0,
    systemJumpsWritten: 0,
    stationOperationsWritten: 0,
    npcStationsWritten: 0,
    targetFiltersWritten: 0,
    industryModifiersWritten: 0,
    assemblyLinesWritten: 0,
    installationTypesWritten: 0,
    durationMs: 0,
  };

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`TRUNCATE TABLE ${blueprintFlatMaterials}, ${blueprintTrees}, ${industryBlueprints}, ${typeDogma}, ${dgmAttributeTypes}, ${eveTypes}, ${eveGroups}, ${eveCategories} RESTART IDENTITY CASCADE`,
      );

      summary.categoriesWritten = await streamInsert(
        paths.categories,
        (r) => {
          const id = intOrNull(r._key);
          const name = localizedEn(r.name);
          if (id === null || name === null) return null;
          return {
            id,
            name,
            iconId: intOrNull(r.iconID),
            published: boolOf(r.published),
          };
        },
        async (batch) => {
          await tx.insert(eveCategories).values(batch);
        },
      );

      summary.groupsWritten = await streamInsert(
        paths.groups,
        (r) => {
          const id = intOrNull(r._key);
          const categoryId = intOrNull(r.categoryID);
          const name = localizedEn(r.name);
          if (id === null || categoryId === null || name === null) return null;
          return {
            id,
            categoryId,
            name,
            iconId: intOrNull(r.iconID),
            useBasePrice: boolOf(r.useBasePrice),
            anchored: boolOf(r.anchored),
            anchorable: boolOf(r.anchorable),
            fittableNonSingleton: boolOf(r.fittableNonSingleton),
            published: boolOf(r.published),
          };
        },
        async (batch) => {
          await tx.insert(eveGroups).values(batch);
        },
      );

      summary.typesWritten = await streamInsert(
        paths.types,
        (r) => {
          const id = intOrNull(r._key);
          const groupId = intOrNull(r.groupID);
          const name = localizedEn(r.name);
          if (id === null || groupId === null || name === null) return null;
          return {
            id,
            groupId,
            name,
            description: localizedEn(r.description),
            mass: numOrNull(r.mass),
            volume: numOrNull(r.volume),
            capacity: numOrNull(r.capacity),
            portionSize: intOrNull(r.portionSize),
            raceId: intOrNull(r.raceID),
            basePrice: intOrNull(r.basePrice),
            published: boolOf(r.published),
            marketGroupId: intOrNull(r.marketGroupID),
            iconId: intOrNull(r.iconID),
            soundId: intOrNull(r.soundID),
            graphicId: intOrNull(r.graphicID),
          };
        },
        async (batch) => {
          await tx.insert(eveTypes).values(batch);
        },
      );

      summary.attributeTypesWritten = await streamInsert(
        paths.dogmaAttributes,
        (r) => {
          const id = intOrNull(r._key);
          const name = strOrNull(r.name);
          if (id === null || name === null) return null;
          return {
            id,
            name,
            description: strOrNull(r.description),
            iconId: intOrNull(r.iconID),
            defaultValue: numOrNull(r.defaultValue),
            published: boolOf(r.published),
            displayName: localizedEn(r.displayName),
            unitId: intOrNull(r.unitID),
            stackable: boolOf(r.stackable),
            highIsGood: boolOf(r.highIsGood),
            categoryId: intOrNull(r.attributeCategoryID),
          };
        },
        async (batch) => {
          await tx.insert(dgmAttributeTypes).values(batch);
        },
      );

      summary.typeDogmaWritten = await streamInsert(
        paths.typeDogma,
        (r) => {
          const typeId = intOrNull(r._key);
          const list = r.dogmaAttributes;
          if (typeId === null || !Array.isArray(list)) return null;
          return { typeId, attributes: Object.fromEntries(dogmaAttributePairs(list)) };
        },
        async (batch) => {
          await tx.insert(typeDogma).values(batch);
        },
      );

      summary.blueprintsWritten = await streamInsert(
        paths.blueprints,
        (r) => {
          const id = intOrNull(r.blueprintTypeID) ?? intOrNull(r._key);
          const max = intOrNull(r.maxProductionLimit);
          const activities = r.activities;
          if (id === null || max === null || !isBlueprintActivitiesDocument(activities)) return null;
          return { blueprintTypeId: id, maxProductionLimit: max, activities };
        },
        async (batch) => {
          await tx.insert(industryBlueprints).values(batch);
        },
      );

      const universeSummary = await emitUniverseNeon(tx, universe);
      summary.regionsWritten = universeSummary.regionsWritten;
      summary.constellationsWritten = universeSummary.constellationsWritten;
      summary.systemsWritten = universeSummary.systemsWritten;
      summary.systemJumpsWritten = universeSummary.systemJumpsWritten;
      summary.stationOperationsWritten = universeSummary.stationOperationsWritten;
      summary.npcStationsWritten = universeSummary.npcStationsWritten;

      const industrySummary = await emitIndustryRules(tx, industryRules);
      summary.targetFiltersWritten = industrySummary.targetFiltersWritten;
      summary.industryModifiersWritten = industrySummary.modifiersWritten;
      summary.assemblyLinesWritten = industrySummary.assemblyLinesWritten;
      summary.installationTypesWritten = industrySummary.installationTypesWritten;
    });
  } finally {
    if (!opts.keepCache) await cleanupSdeJsonl(paths);
  }

  summary.durationMs = Date.now() - start;
  return summary;
}
