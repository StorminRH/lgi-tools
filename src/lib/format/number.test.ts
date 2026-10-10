import { describe, expect, it } from 'vitest';
import { formatCount, formatPct, formatQuantity } from './number';

describe('number formatters', () => {
  it('formats quantities and percentages with null/non-finite guards', () => {
    expect(formatQuantity(1234567)).toBe('1,234,567');
    expect(formatQuantity(999.6)).toBe('1,000');
    expect(formatQuantity(0)).toBe('0');
    expect(formatQuantity(-4200)).toBe('-4,200');
    expect(formatQuantity(null)).toBe('—');
    expect(formatQuantity(Number.NaN)).toBe('—');
    expect(formatQuantity(Number.POSITIVE_INFINITY)).toBe('—');

    expect(formatPct(12.34)).toBe('12.3%');
    expect(formatPct(0)).toBe('0.0%');
    expect(formatPct(-5)).toBe('-5.0%');
    expect(formatPct(null)).toBe('—');
    expect(formatPct(Number.NaN)).toBe('—');
  });

  it('pairs a count with its pluralised noun', () => {
    expect(formatCount(1, 'job')).toBe('1 job');
    expect(formatCount(0, 'job')).toBe('0 jobs');
    expect(formatCount(1234, 'session')).toBe('1,234 sessions');
    expect(formatCount(2, 'match', 'matches')).toBe('2 matches');
    expect(formatCount(0.6, 'job')).toBe('1 job');
    expect(formatCount(1.4, 'day')).toBe('1 day');
  });
});
