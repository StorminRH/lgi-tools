import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostgresJsDb } from '@/lib/db-types';
import type { SdeJsonlPaths } from './source';
import type { UniverseDataset } from './universe';

// CI skips *.db.test.ts, so this mocked transaction is the sole
// gate-of-record coverage for streamInsert and the dogma/blueprint mappers.

const mocks = vi.hoisted(() => ({
  cleanupSdeJsonl: vi.fn(),
  downloadSdeJsonl: vi.fn(),
  emitUniverseNeon: vi.fn(),
  parseUniverse: vi.fn(),
}));

vi.mock('./source', () => ({
  cleanupSdeJsonl: mocks.cleanupSdeJsonl,
  downloadSdeJsonl: mocks.downloadSdeJsonl,
}));

vi.mock('./universe', () => ({
  emitUniverseNeon: mocks.emitUniverseNeon,
  parseUniverse: mocks.parseUniverse,
}));

import { runIngest } from './ingest';

const EMPTY_UNIVERSE: UniverseDataset = {
  regions: [],
  constellations: [],
  systems: [],
  jumps: [],
  operations: [],
  stations: [],
};

const EMPTY_UNIVERSE_SUMMARY = {
  regionsWritten: 0,
  constellationsWritten: 0,
  systemsWritten: 0,
  systemJumpsWritten: 0,
  stationOperationsWritten: 0,
  npcStationsWritten: 0,
};

let fixtureDir: string;
let fixturePaths: SdeJsonlPaths;

function jsonLines(rows: unknown[]): string {
  return rows.map((row) => (typeof row === 'string' ? row : JSON.stringify(row))).join('\n');
}

function fakeDb(): PostgresJsDb {
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    insert: () => ({
      values: (batch: unknown[]) => Promise.resolve(batch),
    }),
  };
  return {
    transaction: async (fn: (inner: typeof tx) => Promise<void>) => fn(tx),
  } as unknown as PostgresJsDb;
}

beforeAll(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), 'lgi-ingest-unit-'));
  const fixturePath = (name: string) => join(fixtureDir, `${name}.jsonl`);
  fixturePaths = {
    categories: fixturePath('categories'),
    groups: fixturePath('groups'),
    types: fixturePath('types'),
    dogmaAttributes: fixturePath('dogmaAttributes'),
    typeDogma: fixturePath('typeDogma'),
    blueprints: fixturePath('blueprints'),
    mapRegions: fixturePath('unused-mapRegions'),
    mapConstellations: fixturePath('unused-mapConstellations'),
    mapSolarSystems: fixturePath('unused-mapSolarSystems'),
    mapStargates: fixturePath('unused-mapStargates'),
    npcStations: fixturePath('unused-npcStations'),
    stationOperations: fixturePath('unused-stationOperations'),
    stationServices: fixturePath('unused-stationServices'),
  };

  const categories = Array.from({ length: 501 }, (_, index) => ({
    _key: index + 1,
    name: { en: `Category ${index + 1}` },
    published: true,
  }));
  await writeFile(
    fixturePaths.categories,
    jsonLines([...categories.slice(0, 250), '', ...categories.slice(250), { _key: null }]),
  );
  await writeFile(
    fixturePaths.groups,
    jsonLines([
      {
        _key: 10,
        categoryID: 1,
        name: { en: 'Group 10' },
        published: true,
      },
    ]),
  );
  await writeFile(
    fixturePaths.types,
    jsonLines([
      {
        _key: 100,
        groupID: 10,
        name: { en: 'Type 100' },
        published: true,
      },
    ]),
  );
  await writeFile(
    fixturePaths.dogmaAttributes,
    jsonLines([{ _key: 20, name: 'massMultiplier', published: true }]),
  );
  await writeFile(
    fixturePaths.typeDogma,
    jsonLines([
      {
        _key: 100,
        dogmaAttributes: [
          { attributeID: 20, value: 1.5 },
          { attributeID: null, value: 10 },
          { attributeID: 21, value: null },
        ],
      },
      { _key: null, dogmaAttributes: [] },
      { _key: 101, dogmaAttributes: null },
    ]),
  );
  await writeFile(
    fixturePaths.blueprints,
    jsonLines([
      {
        blueprintTypeID: 1000,
        maxProductionLimit: 10,
        activities: { manufacturing: { time: 60 } },
      },
      {
        _key: 1001,
        maxProductionLimit: 20,
        activities: { reaction: { time: 120 } },
      },
      { _key: null, maxProductionLimit: 30, activities: {} },
      { _key: 1002, maxProductionLimit: null, activities: {} },
      { _key: 1003, maxProductionLimit: 40 },
    ]),
  );
});

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.downloadSdeJsonl.mockResolvedValue(fixturePaths);
  mocks.parseUniverse.mockResolvedValue(EMPTY_UNIVERSE);
  mocks.emitUniverseNeon.mockResolvedValue(EMPTY_UNIVERSE_SUMMARY);
  mocks.cleanupSdeJsonl.mockResolvedValue(undefined);
});

describe('runIngest', () => {
  it('streams batched JSONL and maps the flagged dogma and blueprint rows', async () => {
    const result = await runIngest(fakeDb());

    expect(result).toEqual({
      categoriesWritten: 501,
      groupsWritten: 1,
      typesWritten: 1,
      attributeTypesWritten: 1,
      typeDogmaWritten: 1,
      blueprintsWritten: 2,
      ...EMPTY_UNIVERSE_SUMMARY,
      durationMs: expect.any(Number),
    });
    expect(mocks.parseUniverse).toHaveBeenCalledWith(fixturePaths);
    expect(mocks.emitUniverseNeon).toHaveBeenCalledWith(expect.anything(), EMPTY_UNIVERSE);
    expect(mocks.cleanupSdeJsonl).toHaveBeenCalledWith(fixturePaths);
  });
});
