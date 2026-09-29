import { describe, expect, it } from 'vitest';
import { searchPeriods } from './search-period';

describe('searchPeriods', () => {
  it.each([['7d', 7], ['30d', 30], ['90d', 90]] as const)('uses %s complete report dates without overlapping the previous window', (key, days) => {
    const { range, previous } = searchPeriods(key, '2026-09-25');
    expect(range.to.toISOString().slice(0, 10)).toBe('2026-09-25');
    expect((range.to.getTime() - range.from.getTime()) / 86_400_000 + 1).toBe(days);
    expect((previous!.to.getTime() - previous!.from.getTime()) / 86_400_000 + 1).toBe(days);
    expect(range.from.getTime() - previous!.to.getTime()).toBe(86_400_000);
  });
  it('handles a year boundary and all-time without a comparison', () => {
    const periods = searchPeriods('7d', '2026-01-03');
    expect(periods.range.from.toISOString().slice(0, 10)).toBe('2025-12-28');
    expect(periods.previous!.to.toISOString().slice(0, 10)).toBe('2025-12-27');
    expect(searchPeriods('all', '2026-01-03').previous).toBeNull();
  });
});
