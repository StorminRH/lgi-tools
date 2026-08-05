import { describe, expect, it } from 'vitest';
import { formatIsk, formatIskCompact, formatIskShort } from './isk';

describe('ISK formatters', () => {
  it('applies Short/Compact/full tier rules and em-dash null handling', () => {
    expect(formatIsk(2_345_000_000)).toBe('2.35B');
    expect(formatIsk(2_345_000)).toBe('2.35M');
    expect(formatIsk(2_345)).toBe('2.3K');
    expect(formatIsk(42)).toBe('42.00');
    // NaN is the load-bearing guard probe: a guard rewritten to `=== null`
    // still passes the null case but renders "NaN" here.
    expect(formatIsk(null)).toBe('—');
    expect(formatIsk(Number.NaN)).toBe('—');

    expect(formatIskShort(2_345_000_000)).toBe('2.3B');
    expect(formatIskShort(2_345_000)).toBe('2.3M');
    expect(formatIskShort(2_345)).toBe('2K');
    expect(formatIskShort(null)).toBe('—');
    expect(formatIskShort(Number.NaN)).toBe('—');

    expect(formatIskCompact(2_345_000_000)).toBe('2.3B');
    expect(formatIskCompact(2_345_000)).toBe('2M');
    expect(formatIskCompact(900_000)).toBe('1M');
    expect(formatIskCompact(Number.NaN)).toBe('—');
  });
});
