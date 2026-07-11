import { describe, expect, it } from 'vitest';
import {
  cockpitMarginView,
  indefiniteArticleForPct,
  inputCostView,
  sellTileView,
} from './cockpit-kpis-view';
import type { BlueprintPricing } from './types';

// Minimal pricing — only the fields the views read. A healthy product (best sell
// == pct5 sell, no regional discount) so both Sell·Jita badges stay off.
const pricing = (over: {
  inputCost?: number;
  revenue?: number | null;
  bases?: { batched: number; marginal: number };
}): BlueprintPricing =>
  ({
    rows: [],
    intermediatePrices: [],
    product: { typeId: 1, bestSell: 100, pct5Sell: 100, regionalDiscount: null },
    summary: {
      basis: 'batched',
      bases: over.bases ?? { batched: 1000, marginal: 800 },
      inputCost: over.inputCost ?? 1000,
      revenue: over.revenue ?? 5000,
      margin: null,
      marginPct: null,
      incomplete: false,
    },
  }) as unknown as BlueprintPricing;

describe('cockpitMarginView', () => {
  it('is gross with a null net when there is no pricing', () => {
    const view = cockpitMarginView(null, 1, null, null, false, 'net');
    expect(view.net).toBeNull();
    expect(view.marginLabel).toBe('Gross margin');
    expect(view.feeSystemName).toBeUndefined();
  });

  it('names the build system as the fee source for a manufacturing blueprint', () => {
    const view = cockpitMarginView(null, 1, { systemName: 'Amarr' }, { systemName: 'Jita' }, false, 'net');
    expect(view.feeSystemName).toBe('Amarr');
  });

  it('names the reaction system as the fee source for a reaction blueprint', () => {
    // activity 11 = reaction: the reaction system wins over the build location.
    const view = cockpitMarginView(null, 11, { systemName: 'Amarr' }, { systemName: 'Jita' }, false, 'net');
    expect(view.feeSystemName).toBe('Jita');
  });

  it('falls back to the build system for a reaction with no reaction system yet', () => {
    const view = cockpitMarginView(null, 11, { systemName: 'Amarr' }, null, false, 'net');
    expect(view.feeSystemName).toBe('Amarr');
  });
});

describe('sellTileView', () => {
  it('shows no badge and a dash revenue with no pricing', () => {
    const view = sellTileView(null);
    expect(view.thinAnchor).toBeNull();
    expect(view.discount).toBeNull();
    expect(view.hasBadge).toBe(false);
    expect(view.revenue).toBe('—');
  });

  it('formats the revenue and keeps badges off for a healthy product', () => {
    const view = sellTileView(pricing({ revenue: 5000 }));
    expect(view.hasBadge).toBe(false);
    expect(view.revenue).not.toBe('—');
  });
});

describe('inputCostView', () => {
  it('is a dash with no bases when there is no pricing', () => {
    expect(inputCostView(null)).toEqual({ bases: null, inputCost: '—' });
  });

  it('carries both cost bases and the formatted input cost', () => {
    const view = inputCostView(pricing({ inputCost: 1234, bases: { batched: 1234, marginal: 900 } }));
    expect(view.bases).toEqual({ batched: 1234, marginal: 900 });
    expect(view.inputCost).not.toBe('—');
  });
});

describe('indefiniteArticleForPct', () => {
  it('uses "an" for the vowel-sounding percents (8/11/18/80–89)', () => {
    for (const pct of [8, 11, 18, 80, 85, 89]) {
      expect(indefiniteArticleForPct(pct)).toBe('an');
    }
  });

  it('uses "a" for everything else', () => {
    for (const pct of [5, 10, 15, 20, 79, 90]) {
      expect(indefiniteArticleForPct(pct)).toBe('a');
    }
  });
});
