import { describe, expect, it } from 'vitest';
import { assetLedgerView, ownedLedgerRow, qtyRingView, ringQty } from './node-card-ledger';

describe('ownedLedgerRow', () => {
  it('splits owned and remaining quantity + ISK at the blended unit price', () => {
    // unit price = 1,000,000 / 1000 = 1000 ISK/unit
    const { owned, remaining } = ownedLedgerRow(1000, 250, 1_000_000);
    expect(owned).toEqual({ qty: '250', isk: '250.0K' });
    expect(remaining).toEqual({ qty: '750', isk: '750.0K' });
  });

  it('owning none leaves the full quantity remaining', () => {
    const { owned, remaining } = ownedLedgerRow(1000, 0, 1_000_000);
    expect(owned).toEqual({ qty: '0', isk: '0.00' });
    expect(remaining).toEqual({ qty: '1,000', isk: '1.00M' });
  });

  it('clamps remaining to zero when owned exceeds the run need', () => {
    const { owned, remaining } = ownedLedgerRow(100, 250, 500_000);
    expect(owned.qty).toBe('250');
    expect(remaining.qty).toBe('0');
  });

  it('shows an em dash for ISK when the row is unpriced', () => {
    const { owned, remaining } = ownedLedgerRow(1000, 250, null);
    expect(owned).toEqual({ qty: '250', isk: '—' });
    expect(remaining).toEqual({ qty: '750', isk: '—' });
  });
});

describe('ringQty', () => {
  it('shows "<1" for a positive sub-half marginal share', () => {
    expect(ringQty(0.3)).toBe('<1');
  });

  it('shows a compact quantity for whole/larger needs (and 0)', () => {
    expect(ringQty(0)).toBe('0');
    expect(ringQty(5)).toBe('5');
  });
});

describe('qtyRingView', () => {
  it('is the empty-track placeholder when no owned count is known', () => {
    expect(qtyRingView('Tritanium', 1000)).toEqual({
      progress: 0,
      remaining: 1000,
      complete: false,
      tone: 'neutral',
      ringLabel: 'Tritanium: 1,000 needed',
    });
  });

  it('fills owned ÷ needed and shrinks the remaining count as stock arrives', () => {
    const view = qtyRingView('Tritanium', 1000, 250);
    expect(view.progress).toBe(0.25);
    expect(view.remaining).toBe(750);
    expect(view.complete).toBe(false);
    expect(view.tone).toBe('isk');
    expect(view.ringLabel).toBe('Tritanium: 750 still needed');
  });

  it('clamps progress at 1 and marks complete when fully owned', () => {
    const view = qtyRingView('Tritanium', 1000, 1200);
    expect(view.progress).toBe(1);
    expect(view.remaining).toBe(0);
    expect(view.complete).toBe(true);
    expect(view.ringLabel).toBe('Tritanium: all 1,000 owned');
  });

  it('never marks a zero-need node complete over an empty ring', () => {
    expect(qtyRingView('X', 0, 0).complete).toBe(false);
  });
});

describe('assetLedgerView', () => {
  it('shows only the needed row (owned/remaining null) when there is no synced quantity', () => {
    const view = assetLedgerView(1000, 1_000_000);
    expect(view.neededQty).toBe('1,000');
    expect(view.neededIsk).not.toBe('—');
    expect(view.owned).toBeNull();
    expect(view.remaining).toBeNull();
  });

  it('renders a dash for the needed ISK when the row is unpriced', () => {
    expect(assetLedgerView(1000, null).neededIsk).toBe('—');
  });

  it('fills owned + remaining cells from the synced quantity', () => {
    const view = assetLedgerView(1000, 1_000_000, 250);
    expect(view.owned).not.toBeNull();
    expect(view.remaining).not.toBeNull();
    expect(view.owned?.qty).toBe('250');
    expect(view.remaining?.qty).toBe('750');
  });
});
