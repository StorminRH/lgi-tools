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
    // BigInt("1.5e6") would throw SyntaxError; we floor via Number() instead.
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

  it('attributes the source as "fuzzwork" before the dispatcher rewrites it', () => {
    // source-fallback.ts always emits 'fuzzwork'; the dispatcher in source.ts
    // rewrites to 'fuzzwork-fallback' when calling this file as a fallback.
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

  it('rejects a malformed aggregates body at the boundary', async () => {
    // 200 OK but a pair is the wrong shape — the boundary schema rejects it,
    // throwing the same way a Fuzzwork HTTP error does today.
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
