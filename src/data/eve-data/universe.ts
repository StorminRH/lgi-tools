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

// ===========================================================================
// Universe parse core + Neon emitter (3.5.1a).
//
// THE SEAM — "one source, two homes" (RQ-5). One shared parse core feeds N
// emitters. This session ships ONE emitter (Neon); a CDN emitter is deferred to
// v4.0's wormhole mapper. The seam *contract* is intentionally just:
//
//   • `parseUniverse(paths) -> UniverseDataset`   — the shared core (pure logic
//        in `buildUniverseDataset`, wrapped in thin async file IO). One
//        download (already done by `downloadSdeJsonl`), one parse, no DB.
//   • `type UniverseDataset`                       — the stable typed contract:
//        projected, K-space-filtered, capability-resolved in-memory arrays.
//
// There is deliberately NO `Emitter` interface/registry — only one emitter
// exists today, and an abstraction for a single v4.0-deferred consumer would be
// speculative. Adding the CDN head later is purely additive: a composition-layer
// build script (at/above `src/db/sde-pipeline.ts`) imports `parseUniverse` +
// `UniverseDataset` and serializes `public/universe/*.json` — ZERO edits here.
//
// WHY THE CORE LIVES IN eve-data (not `sde-pipeline.ts` as RQ-5 phrased it):
// `runIngest` is a data slice and LGI's lint-enforced import-direction boundary
// forbids it importing the composition layer. So the core sits here, where
// `runIngest` can route the Neon ingest through it; the future CDN emitter sits
// above and imports down (composition -> data, allowed).
//
// FUTURE `build:vercel` SLOT for the CDN emitter (documented, NOT built): a new
// UNCONDITIONAL `tsx scripts/emit-universe-cdn.ts` step placed AFTER
// `ingest-sde-if-empty.ts` and BEFORE `next build` (so the static prerender sees
// the fresh `public/` artifacts). It must NOT be folded onto the conditional
// `ingest-sde-if-empty` step — that step skips when Neon is already populated,
// but the CDN artifact must be regenerated on every deploy.
//
// SCOPE: every PERSISTENT New Eden system — K-space + Pochven + J-space
// (wormhole) — plus the static stargate jump graph (3.7.2.2). The richer
// per-WH mapper attributes (statics + environmental effects, sourced from
// anoik.is) and 3-D positions / the K/J-space CDN split remain v4.0; only the
// coarse first-party SDE class (on the system row) and adjacency are here.
// ===========================================================================


// CCP region-ID bands: K-space 10000001–10000070 (incl. Pochven 10000070),
// wormhole/J-space 11000001–11000033, then abyssal deadspace (ADR, instanced)
// and the special/non-standard "VR"/"GPMR" regions all live at 12000000+.
// Filtering on `regionID < 12000000` keeps every persistent system (K-space +
// Pochven + J-space) and excludes only the instanced/special tail — exactly the
// ~2,600 wormhole systems are added over the prior K-space-only `< 11000000`.
const PERSISTENT_REGION_MAX_EXCLUSIVE = 12_000_000;

// Insert chunk size — keeps each statement's bind-param count well under
// Postgres's 64k limit (stations are the widest at 8 cols, so 1000 rows ≈ 8k
// params).
const INSERT_BATCH = 1000;

// ----- The typed contract (one home-agnostic shape both emitters consume) ---

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
  // CCP's coarse location class, derived most-specific (system → constellation →
  // region). Null only for the handful of untagged hi-sec K-space systems. See
  // the `wormhole_class_id` schema note for the value table.
  wormholeClassId: number | null;
};

// A directed system→system jump (one CCP stargate). An undirected gate appears as
// the two reciprocal edges (each physical gate is its own record).
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

// The raw record sets the core operates on (one array per universe file).
export type RawUniverseFiles = {
  regions: Record<string, unknown>[];
  constellations: Record<string, unknown>[];
  systems: Record<string, unknown>[];
  stargates: Record<string, unknown>[];
  stations: Record<string, unknown>[];
  operations: Record<string, unknown>[];
  services: Record<string, unknown>[];
};

// ----- Service-ID resolution + the build assertion --------------------------

// Resolve the Factory (manufacturing) and Laboratory (research) service `_key`s
// from `stationServices.jsonl` BY NAME, at ingest time. In the JSONL SDE the
// service IDs are renumbered 1–27 (Factory=14, Laboratory=15 today) — the legacy
// bitmask values (Factory 8192, Laboratory 16384) are dead and must never be
// hard-coded. Throwing when a name is absent is the build assertion: a CCP
// rename/renumber fails the ingest loudly instead of silently flagging every
// station as non-industry.
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

// ----- The pure core --------------------------------------------------------

// Pure: raw records in, projected/filtered/joined dataset out. No file IO, no
// DB, no logging — so it's fully unit-testable from in-memory fixtures. Each
// pass below filters/joins one entity, threading the surviving id-sets into the
// next; this orchestrator just wires them together.
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

// Regions — every persistent region (K-space + Pochven + J-space), excluding the
// instanced/special tail. Also captures each region's `wormholeClassID` so a
// system can fall back to it when neither the system nor its constellation
// carries one (the region is the least-specific class source).
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

// Constellations — those whose region survived. Captures the constellation-level
// `wormholeClassID` (the mid-specificity class source between system and region).
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

// Solar systems — those whose region survived (CCP ships both regionID and
// constellationID on the system row, so no constellation hop is needed). The
// class is taken most-specific: the system's own `wormholeClassID` (only the 5
// Drifter systems carry one, overriding their region's), else the
// constellation's, else the region's, else null.
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

// Stargate topology → a derived system→system jump graph. Each CCP stargate
// record carries both endpoints directly (`solarSystemID` and
// `destination.solarSystemID`), so an edge is read off without resolving
// gate→gate. Both endpoints must be ingested systems (defensive FK-safety: drops
// any edge to an excluded system, though in practice every gate is K-space /
// Pochven). Deduped on (from, to) to match the table's composite PK.
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

// Station operations (all kept) + the resolved industry-capability join.
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

// NPC stations — kept only when their system is an ingested system AND their
// operation exists. With J-space now ingested this guard rarely fires (every NPC
// station sits in a persistent system); it still defends against an unknown
// operation or a station in an excluded region. Thera's 4 stations — formerly
// dropped because Thera's wormhole system wasn't ingested — are now KEPT (they're
// manufacturing+research capable, so Thera becomes a valid build location).
// Capability booleans are stamped from the station's operation.
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

// A K-space parent (region/constellation/system) with no English name signals
// corrupt SDE: throw rather than row-skip, because skipping a parent would
// FK-orphan its children mid-transaction.
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

// ----- File IO wrapper (the only impure part of the core) -------------------

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

// The shared parse core. Reads the six already-downloaded universe files fully
// (small — 6.5KB–5MB; unlike the 149MB types.jsonl they materialize trivially,
// and the cross-file industry join can't be done streaming) and returns the
// typed dataset. Pure logic lives in `buildUniverseDataset`.
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

// ----- The Neon emitter (this session's only consumer) ----------------------

export type UniverseEmitSummary = {
  regionsWritten: number;
  constellationsWritten: number;
  systemsWritten: number;
  systemJumpsWritten: number;
  stationOperationsWritten: number;
  npcStationsWritten: number;
};

// Wipe + refill the universe tables from the in-memory dataset, inside the
// caller's transaction (`runIngest`'s). Children-first TRUNCATE (CASCADE),
// parents-first insert: jumps and stations both reference systems, so they're
// truncated before / inserted after the systems table. The universe tables are
// FK-independent of the type/blueprint tables, so this is self-contained.
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
