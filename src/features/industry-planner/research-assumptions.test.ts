import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAssumptions, readAssumptions, writeAssumptions } from './research-assumptions';
import { DEFAULT_ASSUMPTIONS } from './research-insight';

describe('parseAssumptions', () => {
  it('falls back to the defaults for nothing, junk or the wrong shape', () => {
    expect(parseAssumptions(null)).toEqual(DEFAULT_ASSUMPTIONS);
    expect(parseAssumptions('{not json')).toEqual(DEFAULT_ASSUMPTIONS);
    expect(parseAssumptions('7')).toEqual(DEFAULT_ASSUMPTIONS);
  });

  it('keeps valid fields and resets out-of-range ones', () => {
    expect(parseAssumptions(JSON.stringify({ batch: 'slotWeek', marketShare: 0.1, salesTaxPct: 3.37, brokerFeePct: 1.5 }))).toEqual({
      batch: 'slotWeek',
      marketShare: 0.1,
      salesTaxPct: 3.37,
      brokerFeePct: 1.5,
    });
    expect(parseAssumptions(JSON.stringify({ batch: 'forever', marketShare: 3, salesTaxPct: -1, brokerFeePct: 99 }))).toEqual(DEFAULT_ASSUMPTIONS);
  });
});

describe('stored assumptions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips through storage and survives a blocked one', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    });
    writeAssumptions({ ...DEFAULT_ASSUMPTIONS, marketShare: 0.35 });
    expect(readAssumptions().marketShare).toBe(0.35);
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('full');
        },
      },
    });
    expect(() => writeAssumptions(DEFAULT_ASSUMPTIONS)).not.toThrow();
    expect(readAssumptions()).toEqual(DEFAULT_ASSUMPTIONS);
  });
});
