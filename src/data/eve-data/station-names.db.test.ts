import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/test-support/db-test-harness';
import { __resetEsiGateForTests, __setScoreboardForTests } from '@/platform/esi';
import { resolveNpcStationNames } from './station-names';
import { eveNpcStations } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_station_name_resolution',
  tables: ['eve_npc_stations'],
  resetBetweenTests: 'truncate',
});

const permissiveScoreboard = {
  async preDispatch() {
    return { effectiveRemaining: 1000, blockedRetryAfter: null, etag: null };
  },
  async budgetSnapshot() {
    return {
      effectiveRemaining: 1000,
      selfCount: 0,
      echo: null,
      source: 'process-local' as const,
    };
  },
  async report() {},
  async getCachedBody() {
    return null;
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function station(id: number, overrides: Partial<typeof eveNpcStations.$inferInsert> = {}) {
  return {
    id,
    solarSystemId: 30_000_142,
    operationId: 14,
    typeId: 1_531,
    ownerId: 1_000_035,
    name: null,
    manufacturingCapable: false,
    researchCapable: false,
    industryCapable: true,
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  __setScoreboardForTests(permissiveScoreboard);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  vi.unstubAllGlobals();
  __resetEsiGateForTests();
});

describe.skipIf(!harness.reachable)('resolveNpcStationNames executes against Postgres', () => {
  it('resolves only unnamed industry stations and keeps non-station responses out', async () => {
    await harness.db.insert(eveNpcStations).values([
      station(60_000_001, { manufacturingCapable: true }),
      station(60_000_002, { researchCapable: true }),
      station(60_000_003, { industryCapable: false }),
      station(60_000_004, { name: 'Already named' }),
    ]);
    fetchMock.mockResolvedValue(
      jsonResponse([
        { category: 'station', id: 60_000_001, name: 'Manufacturing Station' },
        { category: 'station', id: 60_000_002, name: 'Research Station' },
        { category: 'constellation', id: 60_000_002, name: 'Wrong category' },
      ]),
    );

    const result = await resolveNpcStationNames(harness.db);

    expect(result).toEqual({ resolved: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/universe/names/');
    expect(init.method).toBe('POST');
    const requestedIds = JSON.parse(String(init.body)) as number[];
    expect(requestedIds.sort((left, right) => left - right)).toEqual([60_000_001, 60_000_002]);

    const rows = await harness.db.select().from(eveNpcStations);
    expect(new Map(rows.map((row) => [row.id, row.name]))).toEqual(
      new Map([
        [60_000_001, 'Manufacturing Station'],
        [60_000_002, 'Research Station'],
        [60_000_003, null],
        [60_000_004, 'Already named'],
      ]),
    );
  });

  it('returns zero without dispatch when no station needs a name', async () => {
    await harness.db.insert(eveNpcStations).values([
      station(60_000_001, { industryCapable: false }),
      station(60_000_002, { name: 'Already named' }),
    ]);

    await expect(resolveNpcStationNames(harness.db)).resolves.toEqual({ resolved: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a batch unresolved when ESI rejects or returns a non-success response', async () => {
    await harness.db.insert(eveNpcStations).values(station(60_000_001));
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    await expect(resolveNpcStationNames(harness.db)).resolves.toEqual({ resolved: 0 });

    fetchMock.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    await expect(resolveNpcStationNames(harness.db)).resolves.toEqual({ resolved: 0 });

    const [row] = await harness.db.select().from(eveNpcStations);
    expect(row?.name).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('continues with the second batch when the first observed batch fails', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => station(61_000_000 + index));
    await harness.db.insert(eveNpcStations).values(rows);

    const requestedBatches: number[][] = [];
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      const ids = JSON.parse(String(init.body)) as number[];
      requestedBatches.push(ids);
      if (requestedBatches.length === 1) return Promise.reject(new Error('first batch failed'));
      return Promise.resolve(
        jsonResponse(ids.map((id) => ({ category: 'station', id, name: `Station ${id}` }))),
      );
    });

    const result = await resolveNpcStationNames(harness.db);

    expect(requestedBatches.map((batch) => batch.length)).toEqual([1000, 1]);
    expect(result).toEqual({ resolved: requestedBatches[1]!.length });
    const storedNames = new Map(
      (await harness.db.select().from(eveNpcStations)).map((row) => [row.id, row.name]),
    );
    for (const id of requestedBatches[0]!) expect(storedNames.get(id)).toBeNull();
    for (const id of requestedBatches[1]!) expect(storedNames.get(id)).toBe(`Station ${id}`);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
