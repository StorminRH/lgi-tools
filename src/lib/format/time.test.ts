import { describe, expect, it } from 'vitest';
import { formatIsoDay, formatRelativeTime, formatRemaining, formatUtcDate, formatUtcTime } from './time';

describe('time formatters', () => {
  it('formats UTC calendar dates including bare YYYY-MM-DD changelog pins', () => {
    expect(formatUtcDate(new Date('2026-06-19T15:00:00.000Z'))).toBe('19 Jun 2026');
    expect(formatUtcDate('2026-01-02T23:30:00.000Z')).toBe('2 Jan 2026');
    expect(formatUtcDate('2026-07-11')).toBe('11 Jul 2026');
    expect(formatUtcDate('2025-12-31')).toBe('31 Dec 2025');
    expect(formatUtcDate(null)).toBe('—');
    expect(formatUtcDate('not a date')).toBe('—');
    expect(formatUtcTime(new Date('2026-06-19T15:00:00.000Z'))).toBe('15:00');
    expect(formatUtcTime(Date.parse('2026-01-02T23:30:00.000Z'))).toBe('23:30');
    expect(formatUtcTime(null)).toBe('—');
    expect(formatIsoDay(new Date('2026-06-19T15:00:00.000Z'))).toBe('2026-06-19');
  });

  it('floors relative and remaining time to the largest useful units', () => {
    const now = new Date('2026-07-11T12:00:00.000Z').getTime();
    const ago = (ms: number) => new Date(now - ms);

    expect(formatRelativeTime(ago(30_000), now)).toBe('just now');
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe('5m ago');
    expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe('3h ago');
    expect(formatRelativeTime(ago(2 * 86_400_000), now)).toBe('2d ago');
    expect(formatRelativeTime(ago(10 * 86_400_000), now)).toBe('1w ago');
    expect(formatRelativeTime(ago(40 * 86_400_000), now)).toBe('1mo ago');
    expect(formatRelativeTime(null, now)).toBe('—');
    expect(formatRelativeTime(ago(-5_000), now)).toBe('just now');

    expect(formatRemaining(30_000)).toBe('<1m');
    expect(formatRemaining(5 * 60_000)).toBe('5m');
    expect(formatRemaining(3 * 3_600_000 + 20 * 60_000)).toBe('3h 20m');
    expect(formatRemaining(2 * 86_400_000 + 5 * 3_600_000)).toBe('2d 5h');
  });
});
