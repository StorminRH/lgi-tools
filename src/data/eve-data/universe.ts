import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { sql } from 'drizzle-orm';
import type { PgInsertValue, PgTable } from 'drizzle-orm/pg-core';
import {
  eveConstellations,
  eveNpcStations,
  eveRegions,
  eveSolarSystems,
  eveStationOperations,
  eveSystemJumps,
} from './schema';
import { intOrNull, localizedEn, numOrNull } from './coerce';
import type { SdeJsonlPaths } from './source';
import type { AnyPgDb } from '@/lib/db-types';

const PERSISTENT_REGION_MAX_EXCLUSIVE = 12_000_000;

const INSERT_BATCH = 1000;

export type UniverseRegion = {
  id: number;
  name: string;
};

export type UniverseConstellation = {
  id: number;
  regionId: number;
  name: string;
};

export type UniverseSolarSystem = {
  id: number;
  constellationId: number;
  regionId: number;
  name: string;
  securityStatus: number | null;
  wormholeClassId: number | null;
};

export type UniverseSystemJump = {
  fromSystemId: number;
  toSystemId: number;
};

export type UniverseStationOperation = {
  id: number;
  name: string;
};

export type UniverseNpcStation = {
  id: number;
  solarSystemId: number;
  operationId: number;
  typeId: number;
  ownerId: number;
  manufacturingCapable: boolean;
  researchCapable: boolean;
  industryCapable: boolean;
};

export type UniverseDataset = {
  regions: UniverseRegion[];
  constellations: UniverseConstellation[];
  systems: UniverseSolarSystem[];
  jumps: UniverseSystemJump[];
  operations: UniverseStationOperation[];
  stations: UniverseNpcStation[];
};

export type RawUniverseFiles = {
  regions: Record<string, unknown>[];
  constellations: Record<string, unknown>[];
  systems: Record<string, unknown>[];
  stargates: Record<string, unknown>[];
  stations: Record<string, unknown>[];
  operations: Record<string, unknown>[];
  services: Record<string, unknown>[];
};

/**
 * Resolve the Factory (manufacturing) and Laboratory (research) service `_key`s
 * from `stationServices.jsonl` BY NAME, at ingest time. In the JSONL SDE the
 * service IDs are renumbered 1–27 (Factory=14, Laboratory=15 today) — the legacy
 * bitmask values (Factory 8192, Laboratory 16384) are dead and must never be
 * hard-coded. Throwing when a name is absent is the build assertion: a CCP
 * rename/renumber fails the ingest loudly instead of silently flagging every
 * station as non-industry.
 */
export function resolveIndustryServiceIds(services: Record<string, unknown>[]): {
  factoryId: number;
  laboratoryId: number;
} {
  return {
    factoryId: findServiceIdByName(services, 'Factory'),
    laboratoryId: findServiceIdByName(services, 'Laboratory'),
  };
}

function findServiceIdByName(
  services: Record<string, unknown>[],
  englishName: string,
): number {
  for (const s of services) {
    if (localizedEn(s.serviceName) === englishName) {
      const id = intOrNull(s._key);
      if (id !== null) return id;
    }
  }
  throw new Error(
    `SDE stationServices is missing the "${englishName}" service — CCP may have ` +
      `renamed or renumbered station services. Industry capability cannot be ` +
      `resolved; aborting universe ingest.`,
  );
}

export function buildUniverseDataset(raw: RawUniverseFiles): UniverseDataset {
  const { regions, regionIds, regionClass } = projectRegions(raw);
  const { constellations, constellationIds, constellationClass } =
    projectConstellations(raw, regionIds);
  const { systems, systemIds } = projectSystems(
    raw,
    regionIds,
    constellationIds,
    regionClass,
    constellationClass,
  );
  const jumps = projectStargates(raw, systemIds);
  const { operations, operationIds, operationCapability } = projectOperations(raw);
  const stations = projectStations(raw, systemIds, operationIds, operationCapability);
  return { regions, constellations, systems, jumps, operations, stations };
}

function projectRegions(raw: RawUniverseFiles): {
  regions: UniverseRegion[];
  regionIds: Set<number>;
  regionClass: Map<number, number>;
} {
  const regions: UniverseRegion[] = [];
  const regionIds = new Set<number>();
  const regionClass = new Map<number, number>();
  for (const r of raw.regions) {
    const id = intOrNull(r._key);
    if (id === null || id >= PERSISTENT_REGION_MAX_EXCLUSIVE) continue;
    regions.push({ id, name: requireName(r.name, 'region', id) });
    regionIds.add(id);
    const cls = intOrNull(r.wormholeClassID);
    if (cls !== null) regionClass.set(id, cls);
  }
  return { regions, regionIds, regionClass };
}

function projectConstellations(
  raw: RawUniverseFiles,
  regionIds: Set<number>,
): {
  constellations: UniverseConstellation[];
  constellationIds: Set<number>;
  constellationClass: Map<number, number>;
} {
  const constellations: UniverseConstellation[] = [];
  const constellationClass = new Map<number, number>();
  for (const c of raw.constellations) {
    const id = intOrNull(c._key);
    const regionId = intOrNull(c.regionID);
    if (id === null || regionId === null || !regionIds.has(regionId)) continue;
    constellations.push({ id, regionId, name: requireName(c.name, 'constellation', id) });
    const cls = intOrNull(c.wormholeClassID);
    if (cls !== null) constellationClass.set(id, cls);
  }
  return {
    constellations,
    constellationIds: new Set(constellations.map((c) => c.id)),
    constellationClass,
  };
}

function projectSystems(
  raw: RawUniverseFiles,
  regionIds: Set<number>,
  constellationIds: Set<number>,
  regionClass: Map<number, number>,
  constellationClass: Map<number, number>,
): { systems: UniverseSolarSystem[]; systemIds: Set<number> } {
  const systems: UniverseSolarSystem[] = [];
  const systemIds = new Set<number>();
  for (const s of raw.systems) {
    const id = intOrNull(s._key);
    const regionId = intOrNull(s.regionID);
    const constellationId = intOrNull(s.constellationID);
    if (id === null || regionId === null || constellationId === null) continue;
    if (!regionIds.has(regionId) || !constellationIds.has(constellationId)) continue;
    const wormholeClassId =
      intOrNull(s.wormholeClassID) ??
      constellationClass.get(constellationId) ??
      regionClass.get(regionId) ??
      null;
    systems.push({
      id,
      constellationId,
      regionId,
      name: requireName(s.name, 'solar system', id),
      securityStatus: numOrNull(s.securityStatus),
      wormholeClassId,
    });
    systemIds.add(id);
  }
  return { systems, systemIds };
}

function projectStargates(
  raw: RawUniverseFiles,
  systemIds: Set<number>,
): UniverseSystemJump[] {
  const jumps: UniverseSystemJump[] = [];
  const seen = new Set<string>();
  for (const g of raw.stargates) {
    const fromSystemId = intOrNull(g.solarSystemID);
    const dest = g.destination as { solarSystemID?: unknown } | undefined;
    const toSystemId = intOrNull(dest?.solarSystemID);
    if (fromSystemId === null || toSystemId === null) continue;
    if (!systemIds.has(fromSystemId) || !systemIds.has(toSystemId)) continue;
    const key = `${fromSystemId}:${toSystemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jumps.push({ fromSystemId, toSystemId });
  }
  return jumps;
}

type OperationCapability = Map<number, { manufacturing: boolean; research: boolean }>;

function projectOperations(raw: RawUniverseFiles): {
  operations: UniverseStationOperation[];
  operationIds: Set<number>;
  operationCapability: OperationCapability;
} {
  const { factoryId, laboratoryId } = resolveIndustryServiceIds(raw.services);
  const operations: UniverseStationOperation[] = [];
  const operationCapability: OperationCapability = new Map();
  for (const o of raw.operations) {
    const id = intOrNull(o._key);
    if (id === null) continue;
    operations.push({ id, name: requireName(o.operationName, 'station operation', id) });
    const serviceIds = (Array.isArray(o.services) ? o.services : []).filter(
      (v): v is number => typeof v === 'number',
    );
    operationCapability.set(id, {
      manufacturing: serviceIds.includes(factoryId),
      research: serviceIds.includes(laboratoryId),
    });
  }
  return { operations, operationIds: new Set(operations.map((o) => o.id)), operationCapability };
}

function projectStations(
  raw: RawUniverseFiles,
  systemIds: Set<number>,
  operationIds: Set<number>,
  operationCapability: OperationCapability,
): UniverseNpcStation[] {
  const stations: UniverseNpcStation[] = [];
  for (const st of raw.stations) {
    const id = intOrNull(st._key);
    const solarSystemId = intOrNull(st.solarSystemID);
    const operationId = intOrNull(st.operationID);
    const typeId = intOrNull(st.typeID);
    const ownerId = intOrNull(st.ownerID);
    if (
      id === null ||
      solarSystemId === null ||
      operationId === null ||
      typeId === null ||
      ownerId === null
    ) {
      continue;
    }
    if (!systemIds.has(solarSystemId) || !operationIds.has(operationId)) continue;
    const cap = operationCapability.get(operationId) ?? {
      manufacturing: false,
      research: false,
    };
    stations.push({
      id,
      solarSystemId,
      operationId,
      typeId,
      ownerId,
      manufacturingCapable: cap.manufacturing,
      researchCapable: cap.research,
      industryCapable: cap.manufacturing || cap.research,
    });
  }
  return stations;
}

function requireName(value: unknown, kind: string, id: number): string {
  const name = localizedEn(value);
  if (name === null) {
    throw new Error(
      `SDE ${kind} ${id} has no English name — universe data appears corrupt; ` +
        `aborting universe ingest.`,
    );
  }
  return name;
}

async function readJsonl(path: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const rl = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(JSON.parse(trimmed) as Record<string, unknown>);
  }
  return out;
}

export async function parseUniverse(paths: SdeJsonlPaths): Promise<UniverseDataset> {
  const [regions, constellations, systems, stargates, stations, operations, services] =
    await Promise.all([
      readJsonl(paths.mapRegions),
      readJsonl(paths.mapConstellations),
      readJsonl(paths.mapSolarSystems),
      readJsonl(paths.mapStargates),
      readJsonl(paths.npcStations),
      readJsonl(paths.stationOperations),
      readJsonl(paths.stationServices),
    ]);

  const dataset = buildUniverseDataset({
    regions,
    constellations,
    systems,
    stargates,
    stations,
    operations,
    services,
  });

  const droppedStations = stations.length - dataset.stations.length;
  console.log(
    `Universe parse: ${dataset.regions.length} regions, ` +
      `${dataset.constellations.length} constellations, ${dataset.systems.length} systems, ` +
      `${dataset.jumps.length} stargate jumps, ${dataset.operations.length} station operations, ` +
      `${dataset.stations.length} NPC stations ` +
      `(dropped ${droppedStations} unknown-system/unknown-operation stations).`,
  );
  return dataset;
}

export type UniverseEmitSummary = {
  regionsWritten: number;
  constellationsWritten: number;
  systemsWritten: number;
  systemJumpsWritten: number;
  stationOperationsWritten: number;
  npcStationsWritten: number;
};

export async function emitUniverseNeon(
  tx: AnyPgDb,
  dataset: UniverseDataset,
): Promise<UniverseEmitSummary> {
  await tx.execute(
    sql`TRUNCATE TABLE ${eveSystemJumps}, ${eveNpcStations}, ${eveStationOperations}, ${eveSolarSystems}, ${eveConstellations}, ${eveRegions} RESTART IDENTITY CASCADE`,
  );

  await insertChunked(tx, eveRegions, dataset.regions);
  await insertChunked(tx, eveConstellations, dataset.constellations);
  await insertChunked(tx, eveSolarSystems, dataset.systems);
  await insertChunked(tx, eveSystemJumps, dataset.jumps);
  await insertChunked(tx, eveStationOperations, dataset.operations);
  await insertChunked(tx, eveNpcStations, dataset.stations);

  return {
    regionsWritten: dataset.regions.length,
    constellationsWritten: dataset.constellations.length,
    systemsWritten: dataset.systems.length,
    systemJumpsWritten: dataset.jumps.length,
    stationOperationsWritten: dataset.operations.length,
    npcStationsWritten: dataset.stations.length,
  };
}

async function insertChunked<T extends Record<string, unknown>>(
  tx: AnyPgDb,
  table: PgTable,
  rows: T[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    await tx.insert(table).values(rows.slice(i, i + INSERT_BATCH) as PgInsertValue<PgTable>[]);
  }
}
