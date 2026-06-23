import { describe, expect, it } from 'vitest';
import { formatRemaining, formatUtcDate } from './time';

describe('formatRemaining', () => {
  it('formats the largest two units', () => {
    expect(formatRemaining(30_000)).toBe('<1m');
    expect(formatRemaining(5 * 60_000)).toBe('5m');
    expect(formatRemaining(3 * 3_600_000 + 20 * 60_000)).toBe('3h 20m');
    expect(formatRemaining(2 * 86_400_000 + 5 * 3_600_000)).toBe('2d 5h');
  });
});

describe('formatUtcDate', () => {
  it('formats a Date and an ISO string in UTC', () => {
    expect(formatUtcDate(new Date('2026-06-19T15:00:00.000Z'))).toBe('19 Jun 2026');
    expect(formatUtcDate('2026-01-02T23:30:00.000Z')).toBe('2 Jan 2026');
  });

  it('returns an em dash for null or unparseable input', () => {
    expect(formatUtcDate(null)).toBe('—');
    expect(formatUtcDate('not a date')).toBe('—');
  });
});
