import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
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
import { boolOf, intOrNull, localizedEn, numOrNull, strOrNull } from './coerce';
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
  durationMs: number;
};

export type IngestOptions = {
  keepCache?: boolean;
};

const BATCH_SIZE = 500;

// Field coercion helpers (intOrNull / numOrNull / strOrNull / boolOf /
// localizedEn) live in ./coerce so the universe parser can share them without
// either parser importing the other.

// Generic streaming pipeline: JSONL file → one parsed object per line → batched
// insert. `types.jsonl` is ~149 MB / 52k lines, so we read line-by-line via
// readline and never buffer the whole file.
async function streamInsert<T extends Record<string, unknown>>(
  path: string,
  mapRow: (row: Record<string, unknown>) => T | null,
  flush: (batch: T[]) => Promise<void>,
): Promise<number> {
  const rl = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });

  let batch: T[] = [];
  let total = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const mapped = mapRow(JSON.parse(trimmed) as Record<string, unknown>);
    if (!mapped) continue;
    batch.push(mapped);
    if (batch.length >= BATCH_SIZE) {
      await flush(batch);
      total += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await flush(batch);
    total += batch.length;
  }
  return total;
}

export async function runIngest(
  db: PostgresJsDb,
  opts: IngestOptions = {},
): Promise<IngestSummary> {
  const start = Date.now();
  const paths: SdeJsonlPaths = await downloadSdeJsonl();

  // Parse the universe files into the in-memory dataset BEFORE opening the
  // transaction: parsing is CPU-bound and touches no DB, so it must not hold a
  // pinned connection / open transaction. (The download above already happened
  // outside any transaction, per the no-network-in-tx invariant.)
  const universe = await parseUniverse(paths);

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
    durationMs: 0,
  };

  try {
    await db.transaction(async (tx) => {
      // FK-safe wipe: types → groups → categories, then refill in reverse.
      // typeDogma + attribute types stand alone. industry_blueprints and the
      // resolver-computed tables (trees/flat_materials) cascade off the same
      // wipe — trees/flat_materials reference industry_blueprints.
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
          // Fold CCP's `[{attributeID, value}]` into `{ [attributeId]: value }`,
          // the shape getTypeAttributesBatch reads back.
          const attributes: Record<string, number> = {};
          for (const a of list) {
            const attrId = intOrNull((a as Record<string, unknown>).attributeID);
            const value = numOrNull((a as Record<string, unknown>).value);
            if (attrId === null || value === null) continue;
            attributes[String(attrId)] = value;
          }
          return { typeId, attributes };
        },
        async (batch) => {
          await tx.insert(typeDogma).values(batch);
        },
      );

      // Blueprints: CCP's whole nested `activities` object is stored verbatim as
      // JSONB. The resolver/planner read just the manufacturing + reaction keys
      // out of it (see ACTIVITY_NAME_TO_ID); invention/copying/research ride
      // along untouched.
      summary.blueprintsWritten = await streamInsert(
        paths.blueprints,
        (r) => {
          const id = intOrNull(r.blueprintTypeID) ?? intOrNull(r._key);
          const max = intOrNull(r.maxProductionLimit);
          const activities = r.activities;
          if (id === null || max === null || activities === undefined) return null;
          return { blueprintTypeId: id, maxProductionLimit: max, activities };
        },
        async (batch) => {
          await tx.insert(industryBlueprints).values(batch);
        },
      );

      // Universe (regions/constellations/systems/jumps/stations) — wipe + refill
      // its own tables from the pre-parsed dataset, inside this same
      // transaction. Self-contained: those tables are FK-independent of the
      // type/blueprint tables wiped above.
      const universeSummary = await emitUniverseNeon(tx, universe);
      summary.regionsWritten = universeSummary.regionsWritten;
      summary.constellationsWritten = universeSummary.constellationsWritten;
      summary.systemsWritten = universeSummary.systemsWritten;
      summary.systemJumpsWritten = universeSummary.systemJumpsWritten;
      summary.stationOperationsWritten = universeSummary.stationOperationsWritten;
      summary.npcStationsWritten = universeSummary.npcStationsWritten;
    });
  } finally {
    if (!opts.keepCache) await cleanupSdeJsonl(paths);
  }

  summary.durationMs = Date.now() - start;
  return summary;
}
