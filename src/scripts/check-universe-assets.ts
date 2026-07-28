import { gzipSync } from 'node:zlib';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  PG_CONNECT_TIMEOUT_SECONDS,
  resolveLockConnectionUrl,
} from '@/db';
import { readEnv } from '@/lib/env';
import {
  readAdjacencyGraph,
  readSystemDirectory,
  readWormholeCodex,
  type AdjacencyAsset,
  type SystemDirectoryAsset,
  type SystemDirectoryEntry,
  type WormholeCodexEntry,
  type WormholeCodexAsset,
} from '@/data/eve-data/universe-assets';
import { runScript } from './script-runtime';

config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

const JITA_ID = 30_000_142;
const PERIMETER_ID = 30_000_144;
const CLASS_LABELS = [
  ['C1', 1],
  ['C2', 2],
  ['C3', 3],
  ['C4', 4],
  ['C5', 5],
  ['C6', 6],
  ['HS', 7],
  ['LS', 8],
  ['NS', 9],
  ['Thera', 12],
] as const;

const client = postgres(resolveLockConnectionUrl(), {
  max: 1,
  connect_timeout: PG_CONNECT_TIMEOUT_SECONDS,
});

function sizeOf(value: unknown): { rawBytes: number; gzipBytes: number } {
  const raw = Buffer.from(JSON.stringify(value));
  return { rawBytes: raw.byteLength, gzipBytes: gzipSync(raw).byteLength };
}

function typedEntry(
  entry: WormholeCodexEntry | undefined,
  code: string,
): Exclude<WormholeCodexEntry, { farSide: true }> {
  if (entry === undefined || entry.farSide) {
    throw new Error(`Expected typed wormhole codex entry ${code}.`);
  }
  return entry;
}

function countSystemClasses(directory: SystemDirectoryAsset): Map<number, number> {
  const classCounts = new Map<number, number>();
  for (const system of directory.systems) {
    if (system.whClassId !== null) {
      classCounts.set(
        system.whClassId,
        (classCounts.get(system.whClassId) ?? 0) + 1,
      );
    }
  }
  return classCounts;
}

function namedClassCounts(classCounts: ReadonlyMap<number, number>) {
  return Object.fromEntries(
    CLASS_LABELS.map(([label, classId]) => [
      label,
      classCounts.get(classId) ?? 0,
    ]),
  );
}

function neighboursFor(
  neighboursById: ReadonlyMap<number, number[]>,
  systemId: number,
): number[] {
  return neighboursById.get(systemId) ?? [];
}

function requireReciprocalJitaPerimeter(adjacency: AdjacencyAsset): number {
  const neighboursById = new Map(adjacency.adjacency);
  const jitaNeighbours = neighboursFor(neighboursById, JITA_ID);
  const perimeterNeighbours = neighboursFor(neighboursById, PERIMETER_ID);
  if (!jitaNeighbours.includes(PERIMETER_ID)) {
    throw new Error('Jita adjacency is missing Perimeter.');
  }
  if (!perimeterNeighbours.includes(JITA_ID)) {
    throw new Error('Perimeter adjacency is missing Jita.');
  }
  return jitaNeighbours.length;
}

function isRegenerationBearing(
  entry: WormholeCodexEntry,
): entry is Exclude<WormholeCodexEntry, { farSide: true }> {
  return !entry.farSide && entry.massRegen > 0;
}

function requireRegenerationBearing(
  entries: readonly WormholeCodexEntry[],
): Exclude<WormholeCodexEntry, { farSide: true }> {
  const entry = entries.find(isRegenerationBearing);
  if (entry === undefined) {
    throw new Error('No regeneration-bearing wormhole type was found.');
  }
  return entry;
}

function requireFarSide(
  entry: WormholeCodexEntry | undefined,
  code: string,
): Extract<WormholeCodexEntry, { farSide: true }> {
  if (entry === undefined || !entry.farSide) {
    throw new Error(`${code} is missing or is not marked as the far-side entry.`);
  }
  return entry;
}

function requireCodexProof(codex: WormholeCodexAsset) {
  const typeByCode = new Map(codex.types.map((entry) => [entry.code, entry]));
  const b274 = typedEntry(typeByCode.get('B274'), 'B274');
  const regenerating = requireRegenerationBearing(codex.types);
  const k162 = requireFarSide(typeByCode.get('K162'), 'K162');
  return { b274, regenerating, k162 };
}

function requireSystem(
  systems: ReadonlyMap<number, SystemDirectoryEntry>,
  systemId: number,
): SystemDirectoryEntry {
  const system = systems.get(systemId);
  if (system === undefined) {
    throw new Error(`System directory is missing ${systemId}.`);
  }
  return system;
}

function buildReport(
  directory: SystemDirectoryAsset,
  adjacency: AdjacencyAsset,
  codex: WormholeCodexAsset,
) {
  const systemById = new Map(
    directory.systems.map((system) => [system.id, system]),
  );
  const { b274, regenerating, k162 } = requireCodexProof(codex);
  return {
    version: directory.version,
    systems: {
      jita: requireSystem(systemById, JITA_ID),
      perimeter: requireSystem(systemById, PERIMETER_ID),
      jitaDegree: requireReciprocalJitaPerimeter(adjacency),
      reciprocalJitaPerimeter: true,
    },
    classCounts: namedClassCounts(countSystemClasses(directory)),
    codex: {
      B274: b274,
      regenerationBearing: regenerating,
      K162: k162,
    },
    sizes: {
      systems: sizeOf(directory),
      adjacency: sizeOf(adjacency),
      wormholes: sizeOf(codex),
    },
  };
}

async function main() {
  const database = drizzle(client);
  const assets = await Promise.all([
    readSystemDirectory(database),
    readAdjacencyGraph(database),
    readWormholeCodex(database),
  ]);
  console.log(JSON.stringify(buildReport(...assets), null, 2));
}

runScript(main, { client });
