import { describe, expect, it } from 'vitest';
import { toPlainPriceFigures } from './narrow';

const figures = {
  bestBuy: 1,
  bestSell: 2,
  pct5Buy: 0.9,
  pct5Sell: 2.1,
  buyDepth: null,
  sellDepth: null,
};

describe('toPlainPriceFigures', () => {
  it('narrows DB bigint volumes to numbers', () => {
    const out = toPlainPriceFigures({
      ...figures,
      buyVolume: BigInt(100),
      sellVolume: null,
      regionalDiscount: null,
    });
    expect(out.buyVolume).toBe(100);
    expect(out.sellVolume).toBeNull();
  });

  it('narrows wire string volumes to numbers', () => {
    const out = toPlainPriceFigures({
      ...figures,
      buyVolume: '250',
      sellVolume: '0',
      regionalDiscount: { systemId: 30000143, price: 28000, units: 19, pct: 89 },
    });
    expect(out.buyVolume).toBe(250);
    expect(out.sellVolume).toBe(0);
    expect(out.regionalDiscount?.systemId).toBe(30000143);
  });

  it('normalizes an absent regionalDiscount to null (pre-3.7.26.1 payloads)', () => {
    const out = toPlainPriceFigures({ ...figures, buyVolume: null, sellVolume: null });
    expect(out.regionalDiscount).toBeNull();
  });
});
