import { describe, expect, it } from 'vitest';
import { formatIsoDay, formatRelativeTime, formatRemaining, formatUtcDate } from './time';

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

  // Characterization: the changelog timeline feeds bare YYYY-MM-DD dates; these
  // must render identically to the old MONTHS-table formatter EntryCard dropped.
  it('formats bare YYYY-MM-DD changelog dates like the old formatter', () => {
    expect(formatUtcDate('2026-07-11')).toBe('11 Jul 2026');
    expect(formatUtcDate('2026-01-02')).toBe('2 Jan 2026');
    expect(formatUtcDate('2025-12-31')).toBe('31 Dec 2025');
  });
});

describe('formatIsoDay', () => {
  it('renders the UTC calendar day', () => {
    expect(formatIsoDay(new Date('2026-06-19T15:00:00.000Z'))).toBe('2026-06-19');
    expect(formatIsoDay(new Date('2026-01-02T23:30:00.000Z'))).toBe('2026-01-02');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-11T12:00:00.000Z').getTime();
  const ago = (ms: number) => new Date(now - ms);

  it('floors to the largest unit', () => {
    expect(formatRelativeTime(ago(30_000), now)).toBe('just now');
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe('5m ago');
    expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe('3h ago');
    expect(formatRelativeTime(ago(2 * 86_400_000), now)).toBe('2d ago');
    expect(formatRelativeTime(ago(10 * 86_400_000), now)).toBe('1w ago');
    expect(formatRelativeTime(ago(40 * 86_400_000), now)).toBe('1mo ago');
  });

  it('handles null and future timestamps', () => {
    expect(formatRelativeTime(null, now)).toBe('—');
    expect(formatRelativeTime(ago(-5_000), now)).toBe('just now');
  });
});
