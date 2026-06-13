import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  eveConstellations,
  eveNpcStations,
  eveRegions,
  eveSolarSystems,
  eveStationOperations,
} from './schema';
import { intOrNull, localizedEn, numOrNull } from './coerce';
import type { SdeJsonlPaths } from './source';

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
// SCOPE: K-space (gated New Eden) only. Wormhole/abyssal systems, the
// mapper-domain fields (`wormholeClassID`, gate edges, 3-D positions), and the
// K/J-space CDN split are all v4.0.
// ===========================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PostgresJsDatabase<any>;

// K-space = gated New Eden. CCP region IDs: K-space 10000001–10000070 (incl.
// Pochven), wormhole 11000001+, abyssal/special 12000000+. Filtering on
// `regionID < 11000000` keeps exactly the gated systems (the 30M solarSystemID
// range), excluding wormhole + abyssal. Pochven (region 10000070) is included —
// it's K-space; it simply has no NPC stations.
const KSPACE_REGION_MAX_EXCLUSIVE = 11_000_000;

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
  operations: UniverseStationOperation[];
  stations: UniverseNpcStation[];
};

// The six raw record sets the core operates on (one array per universe file).
export type RawUniverseFiles = {
  regions: Record<string, unknown>[];
  constellations: Record<string, unknown>[];
  systems: Record<string, unknown>[];
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
// DB, no logging — so it's fully unit-testable from in-memory fixtures.
export function buildUniverseDataset(raw: RawUniverseFiles): UniverseDataset {
  // Regions — K-space only.
  const regions: UniverseRegion[] = [];
  const regionIds = new Set<number>();
  for (const r of raw.regions) {
    const id = intOrNull(r._key);
    if (id === null || id >= KSPACE_REGION_MAX_EXCLUSIVE) continue;
    regions.push({ id, name: requireName(r.name, 'region', id) });
    regionIds.add(id);
  }

  // Constellations — those whose region survived.
  const constellations: UniverseConstellation[] = [];
  for (const c of raw.constellations) {
    const id = intOrNull(c._key);
    const regionId = intOrNull(c.regionID);
    if (id === null || regionId === null || !regionIds.has(regionId)) continue;
    constellations.push({
      id,
      regionId,
      name: requireName(c.name, 'constellation', id),
    });
  }
  const constellationIds = new Set(constellations.map((c) => c.id));

  // Solar systems — those whose region survived (CCP ships both regionID and
  // constellationID on the system row, so no constellation hop is needed).
  const systems: UniverseSolarSystem[] = [];
  const systemIds = new Set<number>();
  for (const s of raw.systems) {
    const id = intOrNull(s._key);
    const regionId = intOrNull(s.regionID);
    const constellationId = intOrNull(s.constellationID);
    if (id === null || regionId === null || constellationId === null) continue;
    if (!regionIds.has(regionId) || !constellationIds.has(constellationId)) continue;
    systems.push({
      id,
      constellationId,
      regionId,
      name: requireName(s.name, 'solar system', id),
      securityStatus: numOrNull(s.securityStatus),
    });
    systemIds.add(id);
  }

  // Station operations (all kept) + the resolved industry-capability join.
  const { factoryId, laboratoryId } = resolveIndustryServiceIds(raw.services);
  const operations: UniverseStationOperation[] = [];
  const operationCapability = new Map<
    number,
    { manufacturing: boolean; research: boolean }
  >();
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
  const operationIds = new Set(operations.map((o) => o.id));

  // NPC stations — dropped unless their system is an ingested K-space system
  // (the 4 Thera/wormhole stations) and their operation exists. Capability
  // booleans are stamped from the station's operation.
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

  return { regions, constellations, systems, operations, stations };
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
  const [regions, constellations, systems, stations, operations, services] =
    await Promise.all([
      readJsonl(paths.mapRegions),
      readJsonl(paths.mapConstellations),
      readJsonl(paths.mapSolarSystems),
      readJsonl(paths.npcStations),
      readJsonl(paths.stationOperations),
      readJsonl(paths.stationServices),
    ]);

  const dataset = buildUniverseDataset({
    regions,
    constellations,
    systems,
    stations,
    operations,
    services,
  });

  const droppedStations = stations.length - dataset.stations.length;
  console.log(
    `Universe parse: ${dataset.regions.length} regions, ` +
      `${dataset.constellations.length} constellations, ${dataset.systems.length} systems, ` +
      `${dataset.operations.length} station operations, ${dataset.stations.length} NPC stations ` +
      `(dropped ${droppedStations} non-K-space/unknown-operation stations).`,
  );
  return dataset;
}

// ----- The Neon emitter (this session's only consumer) ----------------------

export type UniverseEmitSummary = {
  regionsWritten: number;
  constellationsWritten: number;
  systemsWritten: number;
  stationOperationsWritten: number;
  npcStationsWritten: number;
};

// Wipe + refill the five universe tables from the in-memory dataset, inside the
// caller's transaction (`runIngest`'s). Children-first TRUNCATE (CASCADE),
// parents-first insert. The universe tables are FK-independent of the
// type/blueprint tables, so this is self-contained.
export async function emitUniverseNeon(
  tx: AnyPgDb,
  dataset: UniverseDataset,
): Promise<UniverseEmitSummary> {
  await tx.execute(
    sql`TRUNCATE TABLE ${eveNpcStations}, ${eveStationOperations}, ${eveSolarSystems}, ${eveConstellations}, ${eveRegions} RESTART IDENTITY CASCADE`,
  );

  await insertChunked(tx, eveRegions, dataset.regions);
  await insertChunked(tx, eveConstellations, dataset.constellations);
  await insertChunked(tx, eveSolarSystems, dataset.systems);
  await insertChunked(tx, eveStationOperations, dataset.operations);
  await insertChunked(tx, eveNpcStations, dataset.stations);

  return {
    regionsWritten: dataset.regions.length,
    constellationsWritten: dataset.constellations.length,
    systemsWritten: dataset.systems.length,
    stationOperationsWritten: dataset.operations.length,
    npcStationsWritten: dataset.stations.length,
  };
}

async function insertChunked<T extends Record<string, unknown>>(
  tx: AnyPgDb,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  rows: T[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    await tx.insert(table).values(rows.slice(i, i + INSERT_BATCH));
  }
}
