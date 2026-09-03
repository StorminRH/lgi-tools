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

export interface SystemDirectoryEntry {
  id: number;
  name: string;
  whClassId: number | null;
  security: number | null;
}

export type AdjacencyEntry = [
  systemId: number,
  neighbours: number[],
];

export type { WormholeSizeClass };

export interface FarSideWormholeCodexEntry {
  code: typeof FAR_SIDE_WORMHOLE_CODE;
  typeId: number;
  farSide: true;
}

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

export type WormholeCodexEntry =
  | FarSideWormholeCodexEntry
  | TypedWormholeCodexEntry;

export interface SystemDirectoryAsset {
  version: string;
  systems: SystemDirectoryEntry[];
}

export interface AdjacencyAsset {
  version: string;
  adjacency: AdjacencyEntry[];
}

export interface WormholeCodexAsset {
  version: string;
  types: WormholeCodexEntry[];
}

export interface WormholeTypeRow {
  id: number;
  name: string;
  attributes: unknown;
}

export function buildSystemDirectory(
  rows: readonly SystemDirectoryEntry[],
): SystemDirectoryEntry[] {
  return rows.map((row) => ({ ...row })).sort((a, b) => a.id - b.id);
}

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

export async function getSystemDirectory(): Promise<SystemDirectoryAsset> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);
  return withColdStartRetry(() => readSystemDirectory(db));
}

export async function getAdjacencyGraph(): Promise<AdjacencyAsset> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);
  return withColdStartRetry(() => readAdjacencyGraph(db));
}

export async function getWormholeCodex(): Promise<WormholeCodexAsset> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);
  return withColdStartRetry(() => readWormholeCodex(db));
}
