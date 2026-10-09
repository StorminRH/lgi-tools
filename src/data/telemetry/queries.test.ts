import { describe, expect, it } from 'vitest';
import { lastNDaysRange } from './queries';

process.env.LOCAL_DB_DRIVER = 'postgres-js';
process.env.DATABASE_URL ||= 'postgres://lgi:lgi@localhost:5433/lgi_tools';

describe('lastNDaysRange', () => {
  it('returns the range [now - N*24h, now] across window sizes', () => {
    const now = new Date('2026-05-25T12:00:00Z');
    const range = lastNDaysRange(7, now);
    expect(range.to.toISOString()).toBe('2026-05-25T12:00:00.000Z');
    expect(range.from.toISOString()).toBe('2026-05-18T12:00:00.000Z');
    expect(lastNDaysRange(1, now).from.toISOString()).toBe('2026-05-24T12:00:00.000Z');
    expect(lastNDaysRange(30, now).from.toISOString()).toBe('2026-04-25T12:00:00.000Z');
  });
});
