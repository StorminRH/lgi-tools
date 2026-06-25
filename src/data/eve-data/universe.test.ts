import { describe, expect, it } from 'vitest';
import {
  buildUniverseDataset,
  resolveIndustryServiceIds,
  type RawUniverseFiles,
} from './universe';

// Minimal CCP-shaped record builders. Field names mirror the live JSONL
// (capital-ID suffixes, localized `{ en }` name objects). `wormholeClassID` is
// optional on regions/constellations/systems exactly as in the SDE.
const svc = (id: number, en: string) => ({ _key: id, serviceName: { en } });
const region = (id: number, en: string, wormholeClassID?: number) => ({
  _key: id,
  name: { en },
  ...(wormholeClassID !== undefined ? { wormholeClassID } : {}),
});
const constellation = (
  id: number,
  regionID: number,
  en: string,
  wormholeClassID?: number,
) => ({
  _key: id,
  regionID,
  name: { en },
  ...(wormholeClassID !== undefined ? { wormholeClassID } : {}),
});
const system = (
  id: number,
  constellationID: number,
  regionID: number,
  en: string,
  securityStatus: number,
  wormholeClassID?: number,
) => ({
  _key: id,
  constellationID,
  regionID,
  name: { en },
  securityStatus,
  ...(wormholeClassID !== undefined ? { wormholeClassID } : {}),
});
const operation = (id: number, en: string, services: number[]) => ({
  _key: id,
  operationName: { en },
  services,
});
const station = (
  id: number,
  solarSystemID: number,
  operationID: number,
) => ({ _key: id, solarSystemID, operationID, typeID: 1531, ownerID: 1000035 });
// A stargate carries both endpoints directly: its own system + the destination's.
const stargate = (id: number, fromSys: number, toSys: number) => ({
  _key: id,
  solarSystemID: fromSys,
  destination: { solarSystemID: toSys, stargateID: id + 1 },
});

// Factory = 14, Laboratory = 15 in the live SDE; tests resolve by name, never
// by the literal — proving the renumber-safety the build assertion guarantees.
const SERVICES = [svc(7, 'Market'), svc(14, 'Factory'), svc(15, 'Laboratory')];

describe('resolveIndustryServiceIds', () => {
  it('resolves Factory and Laboratory by name from the live numbering', () => {
    expect(resolveIndustryServiceIds(SERVICES)).toEqual({
      factoryId: 14,
      laboratoryId: 15,
    });
  });

  it('follows a CCP renumber (proves the IDs are never hard-coded)', () => {
    const renumbered = [svc(99, 'Factory'), svc(100, 'Laboratory')];
    expect(resolveIndustryServiceIds(renumbered)).toEqual({
      factoryId: 99,
      laboratoryId: 100,
    });
  });

  it('throws (the build assertion) when a service name is absent', () => {
    expect(() => resolveIndustryServiceIds([svc(15, 'Laboratory')])).toThrow(
      /Factory/,
    );
    expect(() => resolveIndustryServiceIds([svc(14, 'Factory')])).toThrow(
      /Laboratory/,
    );
  });
});

describe('buildUniverseDataset', () => {
  // One scenario spanning the whole persistent universe: K-space (Jita, with
  // stations + a class-tagged region, and a class-less K system), J-space (a
  // regular C1 wormhole, Thera with its industry stations, and a Drifter system
  // whose system-level class overrides its region), an excluded abyssal system,
  // and the stargate jump graph (incl. an orphan edge + a duplicate).
  const raw: RawUniverseFiles = {
    services: SERVICES,
    regions: [
      region(10000002, 'The Forge', 7), // K-space hi-sec, region class 7
      region(10000099, 'Untagged K'), // K-space, no class anywhere → null
      region(11000001, 'A-R00001', 1), // J-space C1
      region(11000031, 'G-R00031', 12), // Thera region (class 12)
      region(11000033, 'K-R00033', 1), // Drifter region (region class 1)
      region(12000001, 'ADR01', 19), // abyssal — excluded (regionID ≥ 12M)
    ],
    constellations: [
      constellation(20000020, 10000002, 'Kimotoro', 7),
      constellation(20009900, 10000099, 'Untagged C'), // no class
      constellation(21000311, 11000001, 'A-C00001', 1),
      constellation(21000324, 11000031, 'Thera constellation', 12),
      constellation(21000334, 11000033, 'K-C00033', 1),
      constellation(22000001, 12000001, 'ADC01', 19), // abyssal — excluded
    ],
    systems: [
      system(30000142, 20000020, 10000002, 'Jita', 0.946), // K → region class 7
      system(30009999, 20009900, 10000099, 'NoClass', 0.5), // K → null
      system(31000007, 21000311, 11000001, 'J105443', -0.99), // J → const/region 1
      system(31000005, 21000324, 11000031, 'Thera', -1), // J → class 12
      system(31002238, 21000334, 11000033, 'Sentinel MZ', -0.99, 14), // Drifter override
      system(32000001, 22000001, 12000001, 'AD001', -1, 19), // abyssal — excluded
    ],
    stargates: [
      stargate(50001248, 30000142, 30009999), // Jita → NoClass
      stargate(50001249, 30009999, 30000142), // NoClass → Jita (reciprocal)
      stargate(50001250, 30000142, 30009999), // duplicate of the first → deduped
      stargate(50009999, 30000142, 32000001), // edge to an excluded system → dropped
    ],
    operations: [
      operation(14, 'Assembly Plant', [7, 14]), // Factory → manufacturing
      operation(15, 'Research Centre', [15]), // Laboratory → research
      operation(26, 'Storage', [7]), // neither → not industry-capable
    ],
    stations: [
      station(60003760, 30000142, 14), // Jita 4-4 — manufacturing
      station(60003761, 30000142, 15), // research
      station(60003762, 30000142, 26), // non-industry
      station(60015148, 31000005, 14), // Thera station — now KEPT (system ingested)
    ],
  };

  const dataset = buildUniverseDataset(raw);
  const sysById = new Map(dataset.systems.map((s) => [s.id, s]));

  it('keeps every persistent region / constellation / system and excludes abyssal', () => {
    expect(dataset.regions.map((r) => r.id).sort()).toEqual([
      10000002, 10000099, 11000001, 11000031, 11000033,
    ]);
    expect(dataset.constellations.map((c) => c.id)).not.toContain(22000001);
    // J-space systems are now ingested; the abyssal system (region ≥ 12M) is not.
    expect(sysById.has(31000007)).toBe(true); // J105443
    expect(sysById.has(31000005)).toBe(true); // Thera
    expect(sysById.has(32000001)).toBe(false); // AD001 — excluded
  });

  it('carries a system\'s region/constellation and security status straight through', () => {
    expect(sysById.get(30000142)).toMatchObject({
      id: 30000142,
      constellationId: 20000020,
      regionId: 10000002,
      name: 'Jita',
      securityStatus: 0.946,
    });
  });

  it('derives the wormhole class most-specific (system → constellation → region)', () => {
    expect(sysById.get(31000007)?.wormholeClassId).toBe(1); // from const/region
    expect(sysById.get(31000005)?.wormholeClassId).toBe(12); // Thera region
    expect(sysById.get(31002238)?.wormholeClassId).toBe(14); // system override beats region 1
    expect(sysById.get(30000142)?.wormholeClassId).toBe(7); // K-space region class
    expect(sysById.get(30009999)?.wormholeClassId).toBeNull(); // untagged everywhere
  });

  it('builds a deduped, FK-safe system jump graph', () => {
    // Both reciprocal edges survive; the duplicate is collapsed; the edge to the
    // excluded abyssal system is dropped (both endpoints must be ingested).
    expect(dataset.jumps).toEqual([
      { fromSystemId: 30000142, toSystemId: 30009999 },
      { fromSystemId: 30009999, toSystemId: 30000142 },
    ]);
  });

  it('keeps all 68-style operations with English names', () => {
    expect(dataset.operations).toEqual([
      { id: 14, name: 'Assembly Plant' },
      { id: 15, name: 'Research Centre' },
      { id: 26, name: 'Storage' },
    ]);
  });

  it('keeps Thera\'s station now that its wormhole system is ingested', () => {
    expect(dataset.stations.map((s) => s.id)).toContain(60015148);
    expect(dataset.stations.find((s) => s.id === 60015148)).toMatchObject({
      solarSystemId: 31000005,
      manufacturingCapable: true,
      industryCapable: true,
    });
  });

  it('stamps capability booleans from the station\'s operation', () => {
    const byId = new Map(dataset.stations.map((s) => [s.id, s]));
    // Jita 4-4 → Factory → manufacturing only.
    expect(byId.get(60003760)).toMatchObject({
      manufacturingCapable: true,
      researchCapable: false,
      industryCapable: true,
    });
    // Research centre → Laboratory → research only.
    expect(byId.get(60003761)).toMatchObject({
      manufacturingCapable: false,
      researchCapable: true,
      industryCapable: true,
    });
    // Storage → neither.
    expect(byId.get(60003762)).toMatchObject({
      manufacturingCapable: false,
      researchCapable: false,
      industryCapable: false,
    });
  });

  it('leaves K-space rows byte-identical when J-space inputs are added', () => {
    // The hard constraint: the widened filter only ADDS rows; it never alters an
    // existing K-space row. Build a K-space-only variant (drop every J-space and
    // abyssal input, regionID ≥ 11M) and assert the K-space rows in the full
    // build are identical to it.
    const isK = (regionId: number) => regionId < 11_000_000;
    const kRegionIds = new Set(
      raw.regions.map((r) => r._key as number).filter(isK),
    );
    const kSystemIds = new Set(
      raw.systems
        .filter((s) => isK(s.regionID as number))
        .map((s) => s._key as number),
    );
    const kOnly: RawUniverseFiles = {
      services: raw.services,
      operations: raw.operations,
      regions: raw.regions.filter((r) => kRegionIds.has(r._key as number)),
      constellations: raw.constellations.filter((c) =>
        kRegionIds.has(c.regionID as number),
      ),
      systems: raw.systems.filter((s) => isK(s.regionID as number)),
      stargates: raw.stargates.filter(
        (g) =>
          kSystemIds.has(g.solarSystemID as number) &&
          kSystemIds.has(
            (g.destination as { solarSystemID: number }).solarSystemID,
          ),
      ),
      stations: raw.stations.filter((st) =>
        kSystemIds.has(st.solarSystemID as number),
      ),
    };
    const kDataset = buildUniverseDataset(kOnly);

    expect(dataset.systems.filter((s) => isK(s.regionId))).toEqual(
      kDataset.systems,
    );
    expect(dataset.stations.filter((s) => kSystemIds.has(s.solarSystemId))).toEqual(
      kDataset.stations,
    );
    expect(
      dataset.jumps.filter(
        (j) => kSystemIds.has(j.fromSystemId) && kSystemIds.has(j.toSystemId),
      ),
    ).toEqual(kDataset.jumps);
  });

  it('throws on a persistent parent with no English name (corrupt SDE)', () => {
    const corrupt: RawUniverseFiles = {
      ...raw,
      regions: [{ _key: 10000002, name: {} }],
    };
    expect(() => buildUniverseDataset(corrupt)).toThrow(/region 10000002/);
  });
});
