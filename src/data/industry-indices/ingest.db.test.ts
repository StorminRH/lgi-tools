import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { esiResponses } from '@/data/esi-store/schema';
import { __resetEsiGateForTests } from '@/platform/esi';
import { refreshIndustryIndices } from './ingest';
import { adjustedPrices, industryCostIndices } from './schema';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

const harness = await createDbTestHarness({
  schema: 'test_industry_indices_ingest',
  tables: ['industry_cost_indices', 'adjusted_prices', 'esi_responses'],
  steerDbProxy: true,
  // Keep the gate off Upstash; the harness owns these stubs for the whole suite.
  env: { KV_REST_API_URL: '', KV_REST_API_TOKEN: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '' },
  resetBetweenTests: 'delete',
});

const EXPIRES = new Date(Date.now() + 3_600_000).toUTCString();

function answer(path: string, body: unknown, etag: string): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { ETag: etag, Expires: EXPIRES, 'x-lgi-path': path } });
}

function costIndices(jita: number, amarr: number) {
  return [
    { solar_system_id: 30000142, cost_indices: [{ activity: 'manufacturing', cost_index: jita }, { activity: 'reaction', cost_index: 0.01 }] },
    { solar_system_id: 30002187, cost_indices: [{ activity: 'manufacturing', cost_index: amarr }] },
  ];
}

function prices(tritanium: number | null) {
  return [
    { type_id: 34, adjusted_price: tritanium ?? undefined, average_price: 4 },
    { type_id: 35, adjusted_price: 9, average_price: 9.5 },
  ];
}

describe.skipIf(!harness.reachable)('industry index ingest against Postgres', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetEsiGateForTests();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  // Only spies restore here. Env stubs belong to the harness: clearing them
  // early would strip DATABASE_URL before its afterAll closes the proxy.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function esiAnswers(jita: number, tritanium: number | null, etags: [string, string]) {
    fetchSpy.mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes('/industry/systems/')) return Promise.resolve(answer(url, costIndices(jita, 0.02), etags[0]));
      if (url.includes('/markets/prices/')) return Promise.resolve(answer(url, prices(tritanium), etags[1]));
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
  }

  it('writes only the rows whose values changed, so unchanged rows keep their updated_at', async () => {
    esiAnswers(0.05, 2.9, ['"c1"', '"p1"']);
    const first = await refreshIndustryIndices(harness.db);
    expect(first.costIndices).toEqual({ ok: true, written: 3 });
    expect(first.adjustedPrices).toEqual({ ok: true, written: 2 });

    const stored = await harness.db.select().from(esiResponses);
    expect(stored.map((row) => [row.route, row.etags])).toEqual(
      expect.arrayContaining([['/industry/systems/', ['"c1"']], ['/markets/prices/', ['"p1"']]]),
    );
    // The answers are current, so a second run makes no call and writes nothing.
    const held = await refreshIndustryIndices(harness.db);
    expect(held).toMatchObject({ costIndices: { ok: true, written: 0 }, adjustedPrices: { ok: true, written: 0 } });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await harness.db.update(esiResponses).set({ expiresAt: new Date(Date.now() - 1) });
    const before = await harness.db.select().from(industryCostIndices);
    const pricesBefore = await harness.db.select().from(adjustedPrices);

    esiAnswers(0.07, null, ['"c2"', '"p2"']);
    const second = await refreshIndustryIndices(harness.db);
    expect(second.costIndices).toEqual({ ok: true, written: 1 });
    expect(second.adjustedPrices).toEqual({ ok: true, written: 1 });

    const after = await harness.db.select().from(industryCostIndices);
    const stamp = (rows: typeof after, systemId: number, activity: string) =>
      rows.find((row) => row.solarSystemId === systemId && row.activity === activity)!.updatedAt.getTime();
    expect(stamp(after, 30000142, 'manufacturing')).toBeGreaterThan(stamp(before, 30000142, 'manufacturing'));
    expect(stamp(after, 30000142, 'reaction')).toBe(stamp(before, 30000142, 'reaction'));
    expect(stamp(after, 30002187, 'manufacturing')).toBe(stamp(before, 30002187, 'manufacturing'));
    expect(after.find((row) => row.solarSystemId === 30000142 && row.activity === 'manufacturing')?.costIndex).toBe(0.07);

    const pricesAfter = await harness.db.select().from(adjustedPrices);
    const price = (rows: typeof pricesAfter, typeId: number) => rows.find((row) => row.typeId === typeId)!;
    expect(price(pricesAfter, 34).adjustedPrice).toBeNull();
    expect(price(pricesAfter, 34).updatedAt.getTime()).toBeGreaterThan(price(pricesBefore, 34).updatedAt.getTime());
    expect(price(pricesAfter, 35).updatedAt.getTime()).toBe(price(pricesBefore, 35).updatedAt.getTime());

    const etags = await harness.db.select({ route: esiResponses.route, etags: esiResponses.etags }).from(esiResponses);
    expect(etags).toEqual(expect.arrayContaining([{ route: '/industry/systems/', etags: ['"c2"'] }, { route: '/markets/prices/', etags: ['"p2"'] }]));
  });

  it('moves the expiry on a 304 and leaves every row untouched', async () => {
    esiAnswers(0.05, 2.9, ['"c1"', '"p1"']);
    await refreshIndustryIndices(harness.db);
    await harness.db.update(esiResponses).set({ expiresAt: new Date(Date.now() - 1) });
    const before = await harness.db.select().from(industryCostIndices);

    const later = new Date(Date.now() + 7_200_000).toUTCString();
    fetchSpy.mockResolvedValue(new Response(null, { status: 304, headers: { Expires: later } }));
    const summary = await refreshIndustryIndices(harness.db);
    expect(summary).toMatchObject({ costIndices: { ok: true, written: 0 }, adjustedPrices: { ok: true, written: 0 } });
    expect(await harness.db.select().from(industryCostIndices)).toEqual(before);
    const rows = await harness.db.select().from(esiResponses);
    expect(rows.every((row) => row.expiresAt?.getTime() === Date.parse(later))).toBe(true);
  });
});
