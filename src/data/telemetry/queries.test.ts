import { describe, expect, it } from 'vitest';
import { lastNDaysRange } from './queries';

describe('lastNDaysRange', () => {
  it('returns the range [now - N*24h, now]', () => {
    const now = new Date('2026-05-25T12:00:00Z');
    const range = lastNDaysRange(7, now);
    expect(range.to.toISOString()).toBe('2026-05-25T12:00:00.000Z');
    expect(range.from.toISOString()).toBe('2026-05-18T12:00:00.000Z');
  });

  it('handles a single day', () => {
    const now = new Date('2026-05-25T12:00:00Z');
    const range = lastNDaysRange(1, now);
    expect(range.from.toISOString()).toBe('2026-05-24T12:00:00.000Z');
  });

  it('handles a 30-day window', () => {
    const now = new Date('2026-05-25T00:00:00Z');
    const range = lastNDaysRange(30, now);
    expect(range.from.toISOString()).toBe('2026-04-25T00:00:00.000Z');
  });
});
