import { eq, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import type { AnyPgDb } from '@/lib/db-types';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import {
  BLUEPRINT_STRUCTURE_TAG,
  SDE_META_KEY_VERSION,
} from './constants';
import { getSdeMetaValue } from './meta';
import {
  dgmAttributeTypes,
  eveSolarSystems,
  eveSystemJumps,
  eveTypes,
  typeDogma,
} from './schema';
import {
  FAR_SIDE_WORMHOLE_CODE,
  isWormholeTypeCode,
  wormholeSizeClass,
  type WormholeSizeClass,
} from './wormhole-contract';

const WORMHOLE_GROUP_ID = 988;
const K162_CODE = FAR_SIDE_WORMHOLE_CODE;
/** SDE type-name prefix; the captured code is validated by {@link isWormholeTypeCode}. */
const WORMHOLE_TYPE_NAME = /^Wormhole (.+)$/;
const KNOWN_QA_WORMHOLE_TYPES = new Map([
  [32_894, 'QA Wormhole A'],
  [32_895, 'QA Wormhole B'],
]);

const WORMHOLE_ATTRIBUTE_NAMES = {
  targetClass: 'wormholeTargetSystemClass',
  lifetimeMinutes: 'wormholeMaxStableTime',
  totalMass: 'wormholeMaxStableMass',
  massRegen: 'wormholeMassRegeneration',
  maxJumpMass: 'wormholeMaxJumpMass',
} as const;

type WormholeAttributeName =
  (typeof WORMHOLE_ATTRIBUTE_NAMES)[keyof typeof WORMHOLE_ATTRIBUTE_NAMES];

/** One persistent solar system's map identity, class, and raw security status. */
export interface SystemDirectoryEntry {
  id: number;
  name: string;
  whClassId: number | null;
  security: number | null;
}

/** One sorted stargate-adjacency row: a system ID followed by its sorted neighbour IDs. */
export type AdjacencyEntry = [
  systemId: number,
  neighbours: number[],
];

/** Wormhole jump-size vocabulary; owned by `./wormhole-contract` and re-exported for codex callers. */
export type { WormholeSizeClass };
/** Re-export the shared maximum-mass classifier for existing asset callers. */
export { wormholeSizeClass };

/** The special untyped far-side wormhole entry. */
export interface FarSideWormholeCodexEntry {
  code: typeof FAR_SIDE_WORMHOLE_CODE;
  typeId: number;
  farSide: true;
}

/** One typed wormhole's complete SDE-derived mass, lifetime, size, and destination contract. */
export interface TypedWormholeCodexEntry {
  code: string;
  typeId: number;
  farSide: false;
  totalMass: number;
  maxJumpMass: number;
  massRegen: number;
  lifetimeMinutes: number;
  sizeClass: WormholeSizeClass;
  targetClass: number;
}

/** One wormhole code in the client codex, including K162's explicit far-side shape. */
export type WormholeCodexEntry =
  | FarSideWormholeCodexEntry
  | TypedWormholeCodexEntry;

/** Version-stamped client system-directory asset. */
export interface SystemDirectoryAsset {
  version: string;
  systems: SystemDirectoryEntry[];
}

/** Version-stamped client stargate-adjacency asset. */
export interface AdjacencyAsset {
  version: string;
  adjacency: AdjacencyEntry[];
}

/** Version-stamped client wormhole-type codex asset. */
export interface WormholeCodexAsset {
  version: string;
  types: WormholeCodexEntry[];
}

interface WormholeTypeRow {
  id: number;
  name: string;
  attributes: unknown;
}

/** Projects and ID-sorts the system rows used by the versioned client directory. */
export function buildSystemDirectory(
  rows: readonly SystemDirectoryEntry[],
): SystemDirectoryEntry[] {
  return rows.map((row) => ({ ...row })).sort((a, b) => a.id - b.id);
}

/** Groups, deduplicates, and sorts directed stargate rows into client adjacency entries. */
export function buildAdjacencyGraph(
  rows: readonly { fromSystemId: number; toSystemId: number }[],
): AdjacencyEntry[] {
  const neighboursBySystem = new Map<number, Set<number>>();
  for (const row of rows) {
    const neighbours = neighboursBySystem.get(row.fromSystemId) ?? new Set();
    neighbours.add(row.toSystemId);
    neighboursBySystem.set(row.fromSystemId, neighbours);
  }
  return [...neighboursBySystem]
    .sort(([left], [right]) => left - right)
    .map(([systemId, neighbours]) => [
      systemId,
      [...neighbours].sort((left, right) => left - right),
    ]);
}

/** Resolves the required wormhole attribute IDs by name and rejects schema drift. */
export function resolveWormholeAttributeIds(
  rows: readonly { id: number; name: string }[],
): Record<keyof typeof WORMHOLE_ATTRIBUTE_NAMES, number> {
  const idByName = new Map(rows.map((row) => [row.name, row.id]));
  return Object.fromEntries(
    Object.entries(WORMHOLE_ATTRIBUTE_NAMES).map(([key, name]) => {
      const id = idByName.get(name);
      if (id === undefined) {
        throw new Error(
          `SDE dgmAttributeTypes is missing "${name}" — wormhole codex generation aborted.`,
        );
      }
      return [key, id];
    }),
  ) as Record<keyof typeof WORMHOLE_ATTRIBUTE_NAMES, number>;
}

/** Builds and code-sorts the complete group-988 wormhole codex, including K162. */
export function buildWormholeCodex(
  typeRows: readonly WormholeTypeRow[],
  attributeRows: readonly { id: number; name: string }[],
): WormholeCodexEntry[] {
  const attributeIds = resolveWormholeAttributeIds(attributeRows);
  return typeRows
    .filter((row) => !isKnownQaWormholeType(row))
    .map((row): WormholeCodexEntry => {
      const code = WORMHOLE_TYPE_NAME.exec(row.name)?.[1];
      if (code === undefined || !isWormholeTypeCode(code)) {
        throw new Error(
          `SDE wormhole type ${row.id} has unexpected name "${row.name}".`,
        );
      }
      if (code === K162_CODE) {
        return { code, typeId: row.id, farSide: true };
      }
      const attributes = dogmaAttributes(row);
      const maxJumpMass = requireDogmaNumber(
        row,
        attributes,
        attributeIds.maxJumpMass,
        WORMHOLE_ATTRIBUTE_NAMES.maxJumpMass,
      );
      return {
        code,
        typeId: row.id,
        farSide: false,
        totalMass: requireDogmaNumber(
          row,
          attributes,
          attributeIds.totalMass,
          WORMHOLE_ATTRIBUTE_NAMES.totalMass,
        ),
        maxJumpMass,
        massRegen: requireDogmaNumber(
          row,
          attributes,
          attributeIds.massRegen,
          WORMHOLE_ATTRIBUTE_NAMES.massRegen,
        ),
        lifetimeMinutes: requireDogmaNumber(
          row,
          attributes,
          attributeIds.lifetimeMinutes,
          WORMHOLE_ATTRIBUTE_NAMES.lifetimeMinutes,
        ),
        sizeClass: wormholeSizeClass(maxJumpMass),
        targetClass: requireDogmaNumber(
          row,
          attributes,
          attributeIds.targetClass,
          WORMHOLE_ATTRIBUTE_NAMES.targetClass,
        ),
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code));
}

function isKnownQaWormholeType(row: WormholeTypeRow): boolean {
  return KNOWN_QA_WORMHOLE_TYPES.get(row.id) === row.name;
}

function dogmaAttributes(row: WormholeTypeRow): Record<string, unknown> {
  if (
    typeof row.attributes !== 'object'
    || row.attributes === null
    || Array.isArray(row.attributes)
  ) {
    throw new Error(
      `SDE wormhole type ${row.id} (${row.name}) has no dogma row.`,
    );
  }
  return row.attributes as Record<string, unknown>;
}

function requireDogmaNumber(
  row: WormholeTypeRow,
  attributes: Readonly<Record<string, unknown>>,
  attributeId: number,
  attributeName: WormholeAttributeName,
): number {
  const value = attributes[String(attributeId)];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `SDE wormhole type ${row.id} (${row.name}) is missing numeric ${attributeName}.`,
    );
  }
  return value;
}

async function requireSdeVersion(database: AnyPgDb): Promise<string> {
  const version = await getSdeMetaValue(database, SDE_META_KEY_VERSION);
  if (version === null) {
    throw new Error('SDE metadata has no sde_version row.');
  }
  return version;
}

/** Reads one coherent version-stamped system directory from the shipped SDE mirror. */
export async function readSystemDirectory(
  database: AnyPgDb,
): Promise<SystemDirectoryAsset> {
  const [version, systems] = await Promise.all([
    requireSdeVersion(database),
    database
      .select({
        id: eveSolarSystems.id,
        name: eveSolarSystems.name,
        whClassId: eveSolarSystems.wormholeClassId,
        security: eveSolarSystems.securityStatus,
      })
      .from(eveSolarSystems),
  ]);
  return { version, systems: buildSystemDirectory(systems) };
}

/** Reads one coherent version-stamped stargate adjacency graph from the shipped SDE mirror. */
export async function readAdjacencyGraph(
  database: AnyPgDb,
): Promise<AdjacencyAsset> {
  const [version, jumps] = await Promise.all([
    requireSdeVersion(database),
    database
      .select({
        fromSystemId: eveSystemJumps.fromSystemId,
        toSystemId: eveSystemJumps.toSystemId,
      })
      .from(eveSystemJumps),
  ]);
  return { version, adjacency: buildAdjacencyGraph(jumps) };
}

/** Reads one coherent version-stamped group-988 wormhole codex from the shipped SDE mirror. */
export async function readWormholeCodex(
  database: AnyPgDb,
): Promise<WormholeCodexAsset> {
  const [version, attributeRows, typeRows] = await Promise.all([
    requireSdeVersion(database),
    database
      .select({ id: dgmAttributeTypes.id, name: dgmAttributeTypes.name })
      .from(dgmAttributeTypes)
      .where(
        inArray(dgmAttributeTypes.name, Object.values(WORMHOLE_ATTRIBUTE_NAMES)),
      ),
    database
      .select({
        id: eveTypes.id,
        name: eveTypes.name,
        attributes: typeDogma.attributes,
      })
      .from(eveTypes)
      .leftJoin(typeDogma, eq(typeDogma.typeId, eveTypes.id))
      .where(eq(eveTypes.groupId, WORMHOLE_GROUP_ID)),
  ]);
  return {
    version,
    types: buildWormholeCodex(typeRows, attributeRows),
  };
}

/** Returns the tag-cached system-directory asset used by public route handlers. */
export async function getSystemDirectory(): Promise<SystemDirectoryAsset> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);
  return withColdStartRetry(() => readSystemDirectory(db));
}

/** Returns the tag-cached stargate-adjacency asset used by public route handlers. */
export async function getAdjacencyGraph(): Promise<AdjacencyAsset> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);
  return withColdStartRetry(() => readAdjacencyGraph(db));
}

/** Returns the tag-cached wormhole-type codex used by public route handlers. */
export async function getWormholeCodex(): Promise<WormholeCodexAsset> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);
  return withColdStartRetry(() => readWormholeCodex(db));
}
