import { describe, expect, it } from 'vitest';
import {
  buildUniverseDataset,
  resolveIndustryServiceIds,
  type RawUniverseFiles,
} from './universe';

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
const stargate = (id: number, fromSys: number, toSys: number) => ({
  _key: id,
  solarSystemID: fromSys,
  destination: { solarSystemID: toSys, stargateID: id + 1 },
});

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
  const raw: RawUniverseFiles = {
    services: SERVICES,
    regions: [
      region(10000002, 'The Forge', 7),
      region(10000099, 'Untagged K'),
      region(11000001, 'A-R00001', 1),
      region(11000031, 'G-R00031', 12),
      region(11000033, 'K-R00033', 1),
      region(12000001, 'ADR01', 19),
    ],
    constellations: [
      constellation(20000020, 10000002, 'Kimotoro', 7),
      constellation(20009900, 10000099, 'Untagged C'),
      constellation(21000311, 11000001, 'A-C00001', 1),
      constellation(21000324, 11000031, 'Thera constellation', 12),
      constellation(21000334, 11000033, 'K-C00033', 1),
      constellation(22000001, 12000001, 'ADC01', 19),
    ],
    systems: [
      system(30000142, 20000020, 10000002, 'Jita', 0.946),
      system(30009999, 20009900, 10000099, 'NoClass', 0.5),
      system(31000007, 21000311, 11000001, 'J105443', -0.99),
      system(31000005, 21000324, 11000031, 'Thera', -1),
      system(31002238, 21000334, 11000033, 'Sentinel MZ', -0.99, 14),
      system(32000001, 22000001, 12000001, 'AD001', -1, 19),
    ],
    stargates: [
      stargate(50001248, 30000142, 30009999),
      stargate(50001249, 30009999, 30000142),
      stargate(50001250, 30000142, 30009999),
      stargate(50009999, 30000142, 32000001),
    ],
    operations: [
      operation(14, 'Assembly Plant', [7, 14]),
      operation(15, 'Research Centre', [15]),
      operation(26, 'Storage', [7]),
    ],
    stations: [
      station(60003760, 30000142, 14),
      station(60003761, 30000142, 15),
      station(60003762, 30000142, 26),
      station(60015148, 31000005, 14),
    ],
  };

  const dataset = buildUniverseDataset(raw);
  const sysById = new Map(dataset.systems.map((s) => [s.id, s]));

  it('keeps every persistent region / constellation / system and excludes abyssal', () => {
    expect(dataset.regions.map((r) => r.id).sort()).toEqual([
      10000002, 10000099, 11000001, 11000031, 11000033,
    ]);
    expect(dataset.constellations.map((c) => c.id)).not.toContain(22000001);
    expect(sysById.has(31000007)).toBe(true);
    expect(sysById.has(31000005)).toBe(true);
    expect(sysById.has(32000001)).toBe(false);
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
    expect(sysById.get(31000007)?.wormholeClassId).toBe(1);
    expect(sysById.get(31000005)?.wormholeClassId).toBe(12);
    expect(sysById.get(31002238)?.wormholeClassId).toBe(14);
    expect(sysById.get(30000142)?.wormholeClassId).toBe(7);
    expect(sysById.get(30009999)?.wormholeClassId).toBeNull();
  });

  it('builds a deduped, FK-safe system jump graph', () => {
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
    expect(byId.get(60003760)).toMatchObject({
      manufacturingCapable: true,
      researchCapable: false,
      industryCapable: true,
    });
    expect(byId.get(60003761)).toMatchObject({
      manufacturingCapable: false,
      researchCapable: true,
      industryCapable: true,
    });
    expect(byId.get(60003762)).toMatchObject({
      manufacturingCapable: false,
      researchCapable: false,
      industryCapable: false,
    });
  });

  it('leaves K-space rows byte-identical when J-space inputs are added', () => {
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
