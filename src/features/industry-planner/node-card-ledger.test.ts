import { describe, expect, it } from 'vitest';
import { ownedLedgerRow } from './node-card-ledger';

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
