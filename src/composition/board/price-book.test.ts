import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketPrice } from '@/data/market-prices/types';
import { unitValue } from '@/features/net-worth/valuation';

const mocks = vi.hoisted(() => ({
  getPrices: vi.fn(),
  getAveragePrices: vi.fn(),
  getTypeMarketFacts: vi.fn(),
  seedPlaceholderPrices: vi.fn(),
}));

vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/data/market-prices/queries', () => ({ getPrices: mocks.getPrices }));
vi.mock('@/data/market-prices/ingest', () => ({ seedPlaceholderPrices: mocks.seedPlaceholderPrices }));
vi.mock('@/data/industry-indices/queries', () => ({ getAveragePrices: mocks.getAveragePrices }));
vi.mock('@/data/eve-data/character-facts', () => ({ getTypeMarketFacts: mocks.getTypeMarketFacts }));

import { resolveValuationBook, seedUnpricedTypes } from './price-book';

const ISHTAR = 12005;
const CARACAL = 621;
const TRITANIUM = 34;
const PYERITE = 35;

function book(typeId: number, buy: number | null, sell: number | null): MarketPrice {
  return {
    typeId,
    bestBuy: buy,
    bestSell: sell,
    pct5Buy: buy,
    pct5Sell: sell,
    buyVolume: null,
    sellVolume: null,
    buyDepth: null,
    sellDepth: null,
    regionalDiscount: null,
    source: 'esi',
    updatedAt: new Date('2026-07-23T00:00:00Z'),
    staleAfter: new Date('2026-07-24T00:00:00Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTypeMarketFacts.mockResolvedValue(new Map());
  mocks.seedPlaceholderPrices.mockResolvedValue(0);
});

describe('resolveValuationBook', () => {
  it('floors a legacy junk bid away so an Ishtar-like row values at min(ask, average)', async () => {
    mocks.getPrices.mockResolvedValue(new Map([[ISHTAR, book(ISHTAR, 3_275_400, 139_095_000)]]));
    mocks.getAveragePrices.mockResolvedValue(new Map([[ISHTAR, 138_145_641.51]]));

    const { prices } = await resolveValuationBook([ISHTAR]);

    expect(prices.get(ISHTAR)).toEqual({ jitaMid: 139_095_000, average: 138_145_641.51 });
    expect(unitValue(ISHTAR, prices.get(ISHTAR))).toBe(138_145_641.51);
  });

  it('leaves a tight book alone and applies min(mid, average)', async () => {
    mocks.getPrices.mockResolvedValue(new Map([[TRITANIUM, { ...book(TRITANIUM, 3.95, 4.05), bestBuy: 3.9, bestSell: 4.1 }]]));
    mocks.getAveragePrices.mockResolvedValue(new Map([[TRITANIUM, 3.5]]));

    const { prices } = await resolveValuationBook([TRITANIUM]);

    expect(prices.get(TRITANIUM)).toEqual({ jitaMid: 4, average: 3.5 });
    expect(unitValue(TRITANIUM, prices.get(TRITANIUM))).toBe(3.5);
  });

  it('keeps the ask alone when the bid is floored and there is no average, and names unseeded marketable types', async () => {
    mocks.getPrices.mockResolvedValue(new Map([[CARACAL, book(CARACAL, 490_497, 12_000_000)]]));
    mocks.getAveragePrices.mockResolvedValue(new Map());
    mocks.getTypeMarketFacts.mockResolvedValue(
      new Map([
        [CARACAL, { categoryId: 6, marketGroupId: 75, published: true }],
        [PYERITE, { categoryId: 4, marketGroupId: 1857, published: true }],
        [TRITANIUM, { categoryId: 4, marketGroupId: null, published: true }],
      ]),
    );

    const result = await resolveValuationBook([CARACAL, PYERITE, TRITANIUM]);

    expect(result.prices.get(CARACAL)).toEqual({ jitaMid: 12_000_000, average: null });
    expect(unitValue(CARACAL, result.prices.get(CARACAL))).toBe(12_000_000);
    expect(result.prices.has(PYERITE)).toBe(false);
    expect(result.categories).toEqual(new Map([[CARACAL, 6], [PYERITE, 4], [TRITANIUM, 4]]));
    expect(result.unseeded).toEqual([PYERITE]);
  });

  it('passes the seed request through to the market-prices owner', async () => {
    mocks.seedPlaceholderPrices.mockResolvedValue(2);
    await expect(seedUnpricedTypes([35, 36])).resolves.toBe(2);
    expect(mocks.seedPlaceholderPrices).toHaveBeenCalledWith({}, [35, 36]);
  });
});
