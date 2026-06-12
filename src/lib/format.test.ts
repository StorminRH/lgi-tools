import { describe, expect, it } from 'vitest';
import { formatIsk, formatIskCompact, formatIskShort, formatRemaining } from './format';

describe('formatIsk', () => {
  it('uses two decimals at B/M and one at K', () => {
    expect(formatIsk(2_345_000_000)).toBe('2.35B');
    expect(formatIsk(2_345_000)).toBe('2.35M');
    expect(formatIsk(2_345)).toBe('2.3K');
    expect(formatIsk(42)).toBe('42.00');
  });

  it('returns an em dash for null / non-finite', () => {
    expect(formatIsk(null)).toBe('—');
    expect(formatIsk(Number.NaN)).toBe('—');
  });
});

describe('formatIskShort', () => {
  it('uses one decimal at B/M and whole K below a million', () => {
    expect(formatIskShort(2_345_000_000)).toBe('2.3B');
    expect(formatIskShort(2_345_000)).toBe('2.3M');
    expect(formatIskShort(2_345)).toBe('2K');
  });

  it('returns an em dash for null / non-finite', () => {
    expect(formatIskShort(null)).toBe('—');
    expect(formatIskShort(Number.NaN)).toBe('—');
  });
});

describe('formatRemaining', () => {
  it('formats the largest two units', () => {
    expect(formatRemaining(30_000)).toBe('<1m');
    expect(formatRemaining(5 * 60_000)).toBe('5m');
    expect(formatRemaining(3 * 3_600_000 + 20 * 60_000)).toBe('3h 20m');
    expect(formatRemaining(2 * 86_400_000 + 5 * 3_600_000)).toBe('2d 5h');
  });
});

describe('formatIskCompact', () => {
  it('uses one decimal at B and whole millions below', () => {
    expect(formatIskCompact(2_345_000_000)).toBe('2.3B');
    expect(formatIskCompact(2_345_000)).toBe('2M');
    expect(formatIskCompact(900_000)).toBe('1M');
  });

  it('returns an em dash for null / non-finite', () => {
    expect(formatIskCompact(null)).toBe('—');
    expect(formatIskCompact(Number.NaN)).toBe('—');
  });
});
