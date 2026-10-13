import { expect, expectTypeOf, test } from 'vitest';
import { wirePriceSchema } from './api-contract';
import { toClientPrice } from './narrow';
import type { MarketPrice, PlainPriceFigures } from './types';

const figures = {
  bestBuy: 1,
  bestSell: 2,
  pct5Buy: 0.9,
  pct5Sell: 2.1,
  buyDepth: null,
  sellDepth: null,
};

test('a stored row becomes a client price: bigint volumes as numbers, stale time from its Date', () => {
  const staleAfter = new Date('2026-10-11T12:05:00Z');
  const stored: MarketPrice = {
    ...figures,
    typeId: 34,
    buyVolume: BigInt(100),
    sellVolume: null,
    regionalDiscount: null,
    source: 'esi',
    updatedAt: new Date('2026-10-11T12:00:00Z'),
    staleAfter,
  };

  const out = toClientPrice(stored, staleAfter.getTime());

  expectTypeOf(out).toExtend<PlainPriceFigures>();
  // Only the client figures: the row's typeId and Date columns stay behind.
  expect(out).toStrictEqual({
    ...figures,
    buyVolume: 100,
    sellVolume: null,
    regionalDiscount: null,
    source: 'esi',
    staleAfterMs: staleAfter.getTime(),
  });
});

test('a stored row with no expiry keeps a null stale time', () => {
  const stored: MarketPrice = {
    ...figures,
    typeId: 34,
    buyVolume: null,
    sellVolume: null,
    regionalDiscount: null,
    source: 'esi',
    updatedAt: new Date('2026-10-11T12:00:00Z'),
    staleAfter: null,
  };

  const out = toClientPrice(stored, stored.staleAfter?.getTime() ?? null);

  expectTypeOf(out.staleAfterMs).toEqualTypeOf<number | null>();
  expect(out.staleAfterMs).toBeNull();
});

test('a wire row becomes a client price: string volumes as numbers, stale time parsed from ISO', () => {
  const wire = wirePriceSchema.parse({
    ...figures,
    typeId: 35,
    buyVolume: '250',
    sellVolume: '0',
    regionalDiscount: { systemId: 30000143, price: 28000, units: 19, pct: 89 },
    updatedAt: '2026-10-11T12:00:00.000Z',
    staleAfter: '2026-10-11T12:05:00.000Z',
    source: 'fuzzwork-fallback',
  });

  const out = toClientPrice(wire, Date.parse(wire.staleAfter));

  expectTypeOf(out).toExtend<PlainPriceFigures>();
  expect(out).toStrictEqual({
    ...figures,
    buyVolume: 250,
    sellVolume: 0,
    regionalDiscount: { systemId: 30000143, price: 28000, units: 19, pct: 89 },
    source: 'fuzzwork-fallback',
    staleAfterMs: Date.parse('2026-10-11T12:05:00.000Z'),
  });
});

test('a wire row without regionalDiscount (pre-3.7.26.1 payloads) reads null', () => {
  const wire = wirePriceSchema.parse({
    ...figures,
    typeId: 36,
    buyVolume: null,
    sellVolume: null,
    updatedAt: '2026-10-11T12:00:00.000Z',
    staleAfter: '2026-10-11T12:05:00.000Z',
    source: 'esi',
  });

  expect(toClientPrice(wire, Date.parse(wire.staleAfter)).regionalDiscount).toBeNull();
});
