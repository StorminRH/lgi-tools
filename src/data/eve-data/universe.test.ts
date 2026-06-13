import { describe, expect, it } from 'vitest';
import {
  buildUniverseDataset,
  resolveIndustryServiceIds,
  type RawUniverseFiles,
} from './universe';

// Minimal CCP-shaped record builders. Field names mirror the live JSONL
// (capital-ID suffixes, localized `{ en }` name objects).
const svc = (id: number, en: string) => ({ _key: id, serviceName: { en } });
const region = (id: number, en: string) => ({ _key: id, name: { en } });
const constellation = (id: number, regionID: number, en: string) => ({
  _key: id,
  regionID,
  name: { en },
});
const system = (
  id: number,
  constellationID: number,
  regionID: number,
  en: string,
  securityStatus: number,
) => ({ _key: id, constellationID, regionID, name: { en }, securityStatus });
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
  // One scenario exercising the K-space filter, the three-file industry join,
  // and the orphan-station drop. "Jita 4-4" mirrors the real station 60003760
  // (system 30000142, operation 14 = Factory) used as the live spot-check.
  const raw: RawUniverseFiles = {
    services: SERVICES,
    regions: [
      region(10000002, 'The Forge'), // K-space
      region(11000031, 'Thera region'), // wormhole — excluded
    ],
    constellations: [
      constellation(20000020, 10000002, 'Kimotoro'),
      constellation(21000324, 11000031, 'Thera constellation'), // excluded
    ],
    systems: [
      system(30000142, 20000020, 10000002, 'Jita', 0.946),
      system(31000005, 21000324, 11000031, 'Thera', -1), // wormhole — excluded
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
      station(60014928, 31000005, 14), // Thera — orphan, dropped
    ],
  };

  const dataset = buildUniverseDataset(raw);

  it('keeps only K-space regions / constellations / systems', () => {
    expect(dataset.regions.map((r) => r.id)).toEqual([10000002]);
    expect(dataset.constellations.map((c) => c.id)).toEqual([20000020]);
    expect(dataset.systems.map((s) => s.id)).toEqual([30000142]);
  });

  it('carries a system\'s region/constellation and security status straight through', () => {
    const jita = dataset.systems[0];
    expect(jita).toMatchObject({
      id: 30000142,
      constellationId: 20000020,
      regionId: 10000002,
      name: 'Jita',
      securityStatus: 0.946,
    });
  });

  it('keeps all 68-style operations with English names', () => {
    expect(dataset.operations).toEqual([
      { id: 14, name: 'Assembly Plant' },
      { id: 15, name: 'Research Centre' },
      { id: 26, name: 'Storage' },
    ]);
  });

  it('drops the orphan station whose system is non-K-space (Thera)', () => {
    expect(dataset.stations.map((s) => s.id)).toEqual([
      60003760, 60003761, 60003762,
    ]);
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

  it('throws on a K-space parent with no English name (corrupt SDE)', () => {
    const corrupt: RawUniverseFiles = {
      ...raw,
      regions: [{ _key: 10000002, name: {} }],
    };
    expect(() => buildUniverseDataset(corrupt)).toThrow(/region 10000002/);
  });
});
