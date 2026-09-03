import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import {
  fetchPricesFromFuzzwork,
  type FuzzworkPair,
  type FuzzworkSide,
  normalize,
  parseVolume,
} from './source-fallback';

function side(overrides: Partial<FuzzworkSide> = {}): FuzzworkSide {
  return {
    weightedAverage: '0',
    max: '0',
    min: '0',
    stddev: '0',
    median: '0',
    volume: '0',
    orderCount: '0',
    percentile: '0',
    ...overrides,
  };
}

function pair(buy: Partial<FuzzworkSide>, sell: Partial<FuzzworkSide>): FuzzworkPair {
  return { buy: side(buy), sell: side(sell) };
}

describe('parseVolume', () => {
  it('parses a plain integer string', () => {
    expect(parseVolume('1234567')).toBe(BigInt(1_234_567));
  });

  it('truncates the fractional part rather than rounding', () => {
    expect(parseVolume('1234567.9')).toBe(BigInt(1_234_567));
  });

  it('handles trillions cleanly (above Number.MAX_SAFE_INTEGER)', () => {
    expect(parseVolume('12345678901234567')).toBe(BigInt('12345678901234567'));
  });

  it('returns 0n for "0" and "0.0"', () => {
    expect(parseVolume('0')).toBe(BigInt(0));
    expect(parseVolume('0.0')).toBe(BigInt(0));
  });

  it('returns 0n for an empty string', () => {
    expect(parseVolume('')).toBe(BigInt(0));
  });

  it('handles scientific notation without throwing', () => {
    expect(parseVolume('1.5e6')).toBe(BigInt(1_500_000));
    expect(parseVolume('2E3')).toBe(BigInt(2_000));
  });

  it('returns 0n for non-finite scientific-notation values', () => {
    expect(parseVolume('1e9999')).toBe(BigInt(0));
  });
});

describe('normalize', () => {
  it('extracts best/pct5/volume from both sides when orders exist', () => {
    const raw = normalize(
      34,
      pair(
        { max: '5.20', percentile: '5.00', volume: '1000000', orderCount: '12' },
        { min: '5.50', percentile: '5.80', volume: '500000', orderCount: '8' },
      ),
    );
    expect(raw).toEqual({
      typeId: 34,
      bestBuy: 5.2,
      pct5Buy: 5.0,
      bestSell: 5.5,
      pct5Sell: 5.8,
      buyVolume: BigInt(1_000_000),
      sellVolume: BigInt(500_000),
      buyDepth: null,
      sellDepth: null,
      regionalDiscount: null,
      source: 'fuzzwork',
    });
  });

  it('nulls prices AND volume on a side with orderCount = 0', () => {
    const raw = normalize(
      99,
      pair(
        { orderCount: '0', max: '0', percentile: '0', volume: '0' },
        { min: '5.50', percentile: '5.80', volume: '500000', orderCount: '8' },
      ),
    );
    expect(raw.bestBuy).toBeNull();
    expect(raw.pct5Buy).toBeNull();
    expect(raw.buyVolume).toBeNull();
    expect(raw.bestSell).toBe(5.5);
    expect(raw.sellVolume).toBe(BigInt(500_000));
  });

  it('nulls the whole buy side when the aggregate max is under 35% of the ask', () => {
    const raw = normalize(
      30370,
      pair(
        { max: '0.01', percentile: '0.01', volume: '1000000000', orderCount: '4' },
        { min: '30250', percentile: '30500', volume: '200', orderCount: '6' },
      ),
    );
    expect(raw.bestBuy).toBeNull();
    expect(raw.pct5Buy).toBeNull();
    expect(raw.buyVolume).toBeNull();
    expect(raw.bestSell).toBe(30_250);
  });

  it('nulls only pct5Buy when the percentile is diluted but max clears the floor', () => {
    const raw = normalize(
      30375,
      pair(
        { max: '4604', percentile: '139', volume: '1000000100', orderCount: '8' },
        { min: '4700', percentile: '4750', volume: '300', orderCount: '5' },
      ),
    );
    expect(raw.bestBuy).toBe(4_604);
    expect(raw.pct5Buy).toBeNull();
    expect(raw.buyVolume).toBe(BigInt(1_000_000_100));
    expect(raw.bestSell).toBe(4_700);
  });

  it('attributes the source as "fuzzwork" before the dispatcher rewrites it', () => {
    const raw = normalize(34, pair({ orderCount: '1' }, { orderCount: '1' }));
    expect(raw.source).toBe('fuzzwork');
  });
});

describe('fetchPricesFromFuzzwork outbound headers', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('sends the outbound User-Agent to the Fuzzwork aggregates endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await fetchPricesFromFuzzwork([34]);

    const [, init] = fetchSpy.mock.calls[0];
    expect(new Headers(init?.headers).get('User-Agent')).toBe(
      OUTBOUND_USER_AGENT,
    );
  });

  it('requests the Jita 4-4 STATION aggregate, not the region (3.7.26.1)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await fetchPricesFromFuzzwork([34, 35]);

    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('station=60003760');
    expect(String(url)).not.toContain('region=');
  });

  it('accepts numeric fields on a zero-order side (station-scoped shape)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          '34': {
            buy: { weightedAverage: 0, max: 0, min: 0, stddev: 0, median: 0, volume: 0, orderCount: 0, percentile: 0 },
            sell: { weightedAverage: '5.5', max: '6', min: '5.5', stddev: '0', median: '5.5', volume: '100', orderCount: '3', percentile: '5.5' },
          },
        }),
        { status: 200 },
      ),
    );

    const rows = await fetchPricesFromFuzzwork([34]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.bestBuy).toBeNull();
    expect(rows[0]!.bestSell).toBe(5.5);
  });

  it('rejects a present-but-invalid numeric field ("NaN") at the boundary', async () => {
    const sell: Record<string, string> = {
      weightedAverage: '5.5', max: 'NaN', min: '5.5', stddev: '0', median: '5.5',
      volume: '100', orderCount: '3', percentile: '5.5',
    };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ '34': { buy: sell, sell } }), { status: 200 }),
    );

    await expect(fetchPricesFromFuzzwork([34])).rejects.toThrow(/boundary validation/);
  });

  it('still rejects a side with a MISSING required field at the boundary', async () => {
    const sell: Record<string, string> = {
      weightedAverage: '5.5', max: '6', min: '5.5', stddev: '0', median: '5.5',
      volume: '100', percentile: '5.5',
    };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ '34': { buy: sell, sell } }), { status: 200 }),
    );

    await expect(fetchPricesFromFuzzwork([34])).rejects.toThrow(/boundary validation/);
  });

  it('rejects a malformed aggregates body at the boundary', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ '34': { buy: 'not-a-side' } }), {
        status: 200,
      }),
    );

    await expect(fetchPricesFromFuzzwork([34])).rejects.toThrow(
      /boundary validation/,
    );
  });
});
