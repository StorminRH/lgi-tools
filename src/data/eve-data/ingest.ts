import { createReadStream } from 'node:fs';
import { parse as parseCsv } from 'csv-parse';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import unbzip2Stream from 'unbzip2-stream';
import {
  dgmAttributeTypes,
  dgmTypeAttributes,
  eveCategories,
  eveGroups,
  eveTypes,
} from './schema';
import { downloadDumps, cleanupDumps, type SdeDumpPaths } from './source';

export type IngestSummary = {
  categoriesWritten: number;
  groupsWritten: number;
  typesWritten: number;
  attributeTypesWritten: number;
  typeAttributesWritten: number;
  durationMs: number;
};

export type IngestOptions = {
  keepCache?: boolean;
};

const BATCH_SIZE = 500;

// Fuzzwork stores empty / missing values as the literal string "None".
function nullable(v: string | undefined): string | null {
  if (v === undefined || v === '' || v === 'None') return null;
  return v;
}

function toInt(v: string | undefined): number | null {
  const s = nullable(v);
  if (s === null) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function toFloat(v: string | undefined): number | null {
  const s = nullable(v);
  if (s === null) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function toBool(v: string | undefined): boolean {
  return v === '1' || v === 'true';
}

// Generic streaming pipeline: bz2 file → CSV records → batched insert.
async function streamInsert<T extends Record<string, unknown>>(
  path: string,
  mapRow: (row: Record<string, string>) => T | null,
  flush: (batch: T[]) => Promise<void>,
): Promise<number> {
  const parser = createReadStream(path)
    .pipe(unbzip2Stream())
    .pipe(parseCsv({ columns: true, skip_empty_lines: true, relax_quotes: true }));

  let batch: T[] = [];
  let total = 0;

  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    const mapped = mapRow(row);
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
  db: PostgresJsDatabase,
  opts: IngestOptions = {},
): Promise<IngestSummary> {
  const start = Date.now();
  const paths: SdeDumpPaths = await downloadDumps();

  const summary: IngestSummary = {
    categoriesWritten: 0,
    groupsWritten: 0,
    typesWritten: 0,
    attributeTypesWritten: 0,
    typeAttributesWritten: 0,
    durationMs: 0,
  };

  try {
    await db.transaction(async (tx) => {
      // FK-safe wipe: types → groups → categories, then refill in reverse.
      // Attribute tables stand alone and are wiped here too.
      await tx.execute(
        sql`TRUNCATE TABLE ${dgmTypeAttributes}, ${dgmAttributeTypes}, ${eveTypes}, ${eveGroups}, ${eveCategories} RESTART IDENTITY CASCADE`,
      );

      summary.categoriesWritten = await streamInsert(
        paths.invCategories,
        (r) => {
          const id = toInt(r.categoryID);
          const name = nullable(r.categoryName);
          if (id === null || name === null) return null;
          return {
            id,
            name,
            iconId: toInt(r.iconID),
            published: toBool(r.published),
          };
        },
        async (batch) => {
          await tx.insert(eveCategories).values(batch);
        },
      );

      summary.groupsWritten = await streamInsert(
        paths.invGroups,
        (r) => {
          const id = toInt(r.groupID);
          const categoryId = toInt(r.categoryID);
          const name = nullable(r.groupName);
          if (id === null || categoryId === null || name === null) return null;
          return {
            id,
            categoryId,
            name,
            iconId: toInt(r.iconID),
            useBasePrice: toBool(r.useBasePrice),
            anchored: toBool(r.anchored),
            anchorable: toBool(r.anchorable),
            fittableNonSingleton: toBool(r.fittableNonSingleton),
            published: toBool(r.published),
          };
        },
        async (batch) => {
          await tx.insert(eveGroups).values(batch);
        },
      );

      summary.typesWritten = await streamInsert(
        paths.invTypes,
        (r) => {
          const id = toInt(r.typeID);
          const groupId = toInt(r.groupID);
          const name = nullable(r.typeName);
          if (id === null || groupId === null || name === null) return null;
          return {
            id,
            groupId,
            name,
            description: nullable(r.description),
            mass: toFloat(r.mass),
            volume: toFloat(r.volume),
            capacity: toFloat(r.capacity),
            portionSize: toInt(r.portionSize),
            raceId: toInt(r.raceID),
            basePrice: toInt(r.basePrice),
            published: toBool(r.published),
            marketGroupId: toInt(r.marketGroupID),
            iconId: toInt(r.iconID),
            soundId: toInt(r.soundID),
            graphicId: toInt(r.graphicID),
          };
        },
        async (batch) => {
          await tx.insert(eveTypes).values(batch);
        },
      );

      summary.attributeTypesWritten = await streamInsert(
        paths.dgmAttributeTypes,
        (r) => {
          const id = toInt(r.attributeID);
          const name = nullable(r.attributeName);
          if (id === null || name === null) return null;
          return {
            id,
            name,
            description: nullable(r.description),
            iconId: toInt(r.iconID),
            defaultValue: toFloat(r.defaultValue),
            published: toBool(r.published),
            displayName: nullable(r.displayName),
            unitId: toInt(r.unitID),
            stackable: toBool(r.stackable),
            highIsGood: toBool(r.highIsGood),
            categoryId: toInt(r.categoryID),
          };
        },
        async (batch) => {
          await tx.insert(dgmAttributeTypes).values(batch);
        },
      );

      summary.typeAttributesWritten = await streamInsert(
        paths.dgmTypeAttributes,
        (r) => {
          const typeId = toInt(r.typeID);
          const attributeId = toInt(r.attributeID);
          // Fuzzwork stores every value in valueFloat; valueInt is always "None"
          // in current dumps. Defensive: accept either source.
          const value = toFloat(r.valueFloat) ?? toFloat(r.valueInt);
          if (typeId === null || attributeId === null || value === null) return null;
          return { typeId, attributeId, value };
        },
        async (batch) => {
          await tx.insert(dgmTypeAttributes).values(batch);
        },
      );
    });
  } finally {
    if (!opts.keepCache) await cleanupDumps(paths);
  }

  summary.durationMs = Date.now() - start;
  return summary;
}
