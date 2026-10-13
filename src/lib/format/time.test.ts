import { describe, expect, it } from 'vitest';
import {
  formatElapsed,
  formatIsoDay,
  formatRelativeTime,
  formatRemaining,
  formatUtcDate,
  formatUtcMinute,
  formatUtcTime,
  stripUtcYear,
} from './time';

describe('time formatters', () => {
  it('formats UTC calendar dates including bare YYYY-MM-DD changelog pins', () => {
    expect(formatUtcDate(new Date('2026-06-19T15:00:00.000Z'))).toBe('19 Jun 2026');
    expect(formatUtcDate('2026-01-02T23:30:00.000Z')).toBe('2 Jan 2026');
    expect(formatUtcDate('2026-07-11')).toBe('11 Jul 2026');
    expect(formatUtcDate('2025-12-31')).toBe('31 Dec 2025');
    expect(formatUtcDate(Date.parse('2026-10-09T23:59:59.999Z'))).toBe('9 Oct 2026');
    expect(formatUtcDate(null)).toBe('—');
    expect(formatUtcDate('not a date')).toBe('—');
    expect(formatUtcDate(Number.NaN)).toBe('—');
    expect(formatUtcTime(new Date('2026-06-19T15:00:00.000Z'))).toBe('15:00');
    expect(formatUtcTime(Date.parse('2026-01-02T23:30:00.000Z'))).toBe('23:30');
    expect(formatUtcTime('2026-01-02T00:05:00.000+02:00')).toBe('22:05');
    expect(formatUtcTime(null)).toBe('—');
    expect(formatUtcTime(new Date(Number.NaN))).toBe('—');
    expect(formatIsoDay(new Date('2026-06-19T15:00:00.000Z'))).toBe('2026-06-19');
    expect(formatIsoDay(Date.parse('2026-06-04T23:59:59.999Z'))).toBe('2026-06-04');
    expect(() => formatIsoDay(Number.NaN)).toThrow(RangeError);
  });

  it('stamps UTC minutes from any date input, labelling the zone unless a header already does', () => {
    expect(formatUtcMinute(new Date('2026-06-09T12:34:56.789Z'))).toBe('2026-06-09 12:34 UTC');
    expect(formatUtcMinute(Date.parse('2026-06-09T00:00:59.999Z'))).toBe('2026-06-09 00:00 UTC');
    expect(formatUtcMinute('2026-01-02T23:30:00.000+02:00')).toBe('2026-01-02 21:30 UTC');
    expect(formatUtcMinute(new Date('2026-06-09T12:34:56.789Z'), { zone: false })).toBe('2026-06-09 12:34');
    expect(formatUtcMinute(null)).toBe('—');
    expect(formatUtcMinute(null, { empty: 'never' })).toBe('never');
    expect(formatUtcMinute('not a date', { empty: 'never' })).toBe('never');
  });

  it('strips the year from a UTC date label for compact ticks', () => {
    expect(stripUtcYear(formatUtcDate('2026-10-09'))).toBe('9 Oct');
    expect(stripUtcYear('31 Dec 2025')).toBe('31 Dec');
    expect(stripUtcYear('—')).toBe('—');
  });

  it('floors relative and remaining time to the largest useful units', () => {
    const now = new Date('2026-07-11T12:00:00.000Z').getTime();
    const ago = (ms: number) => new Date(now - ms);

    expect(formatRelativeTime(ago(30_000), now)).toBe('just now');
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe('5m ago');
    expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe('3h ago');
    expect(formatRelativeTime(ago(2 * 86_400_000), now)).toBe('2d ago');
    expect(formatRelativeTime(ago(10 * 86_400_000), now)).toBe('1w ago');
    expect(formatRelativeTime(ago(28 * 86_400_000), now)).toBe('4w ago');
    expect(formatRelativeTime(ago(29 * 86_400_000), now)).toBe('4w ago');
    expect(formatRelativeTime(ago(30 * 86_400_000), now)).toBe('1mo ago');
    expect(formatRelativeTime(ago(40 * 86_400_000), now)).toBe('1mo ago');
    expect(formatRelativeTime(null, now)).toBe('—');
    expect(formatRelativeTime(ago(-5_000), now)).toBe('just now');

    expect(formatRelativeTime(ago(59_999), now, 'd')).toBe('just now');
    expect(formatRelativeTime(ago(60_000), now, 'd')).toBe('1m ago');
    expect(formatRelativeTime(ago(59 * 60_000), now, 'd')).toBe('59m ago');
    expect(formatRelativeTime(ago(60 * 60_000), now, 'd')).toBe('1h ago');
    expect(formatRelativeTime(ago(23 * 3_600_000), now, 'd')).toBe('23h ago');
    expect(formatRelativeTime(ago(24 * 3_600_000), now, 'd')).toBe('1d ago');
    expect(formatRelativeTime(ago(15 * 86_400_000), now, 'd')).toBe('15d ago');

    expect(formatRemaining(30_000)).toBe('<1m');
    expect(formatRemaining(5 * 60_000)).toBe('5m');
    expect(formatRemaining(3 * 3_600_000 + 20 * 60_000)).toBe('3h 20m');
    expect(formatRemaining(2 * 86_400_000 + 5 * 3_600_000)).toBe('2d 5h');
  });

  it('floors elapsed ages to a compact unit with a configurable day cut-over', () => {
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;

    expect(formatElapsed(-5 * minute)).toBe('<1m');
    expect(formatElapsed(0)).toBe('<1m');
    expect(formatElapsed(59_999)).toBe('<1m');
    expect(formatElapsed(6 * minute)).toBe('6m');
    expect(formatElapsed(3 * hour)).toBe('3h');
    expect(formatElapsed(day)).toBe('1d');
    expect(formatElapsed(2 * day)).toBe('2d');
    expect(formatElapsed(45 * day)).toBe('45d');

    expect(formatElapsed(47 * hour + 59 * minute, { dayAfterHours: 48 })).toBe('47h');
    expect(formatElapsed(48 * hour, { dayAfterHours: 48 })).toBe('2d');

    expect(formatElapsed(6 * day, { largest: 'mo' })).toBe('6d');
    expect(formatElapsed(10 * day, { largest: 'mo' })).toBe('1w');
    expect(formatElapsed(28 * day, { largest: 'mo' })).toBe('4w');
    expect(formatElapsed(29 * day, { largest: 'mo' })).toBe('4w');
    expect(formatElapsed(30 * day, { largest: 'mo' })).toBe('1mo');
    expect(formatElapsed(65 * day, { largest: 'mo' })).toBe('2mo');
  });
});
