import { describe, expect, it } from 'vitest';
import { formatPct, formatQuantity } from './number';

describe('number formatters', () => {
  it('formats quantities and percentages with null/non-finite guards', () => {
    expect(formatQuantity(1234567)).toBe('1,234,567');
    expect(formatQuantity(999.6)).toBe('1,000');

    expect(formatPct(12.34)).toBe('12.3%');
    expect(formatPct(0)).toBe('0.0%');
    expect(formatPct(-5)).toBe('-5.0%');
    expect(formatPct(null)).toBe('—');
    expect(formatPct(Number.NaN)).toBe('—');
  });
});
