import { describe, expect, it } from 'vitest';
import { formatPct, formatQuantity } from './number';

describe('formatPct', () => {
  it('formats a finite number with one decimal and a percent sign', () => {
    expect(formatPct(12.34)).toBe('12.3%');
    expect(formatPct(0)).toBe('0.0%');
    expect(formatPct(-5)).toBe('-5.0%');
  });

  it('returns an em dash for null or non-finite input', () => {
    expect(formatPct(null)).toBe('—');
    expect(formatPct(Number.NaN)).toBe('—');
    expect(formatPct(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatQuantity', () => {
  it('rounds to whole units with thousands separators', () => {
    expect(formatQuantity(1234567)).toBe('1,234,567');
    expect(formatQuantity(999.6)).toBe('1,000');
  });
});
