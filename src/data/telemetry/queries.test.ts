import { describe, expect, it } from 'vitest';
import { lastNDaysRange, topByMetadataKeyToSQL } from './queries';

// The lazy `db` Proxy only needs a constructible client to serialize SQL — no
// socket opens until a query is awaited, and `.toSQL()` never awaits. A dummy
// DATABASE_URL (schema is z.string().min(1)) over the local TCP driver is enough.
process.env.LOCAL_DB_DRIVER = 'postgres-js';
process.env.DATABASE_URL ||= 'postgres://lgi:lgi@localhost:5433/lgi_tools';

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

// Regression guard for the /admin 500 (Postgres 42803): the metadata-keyed top-N
// query must group by the SELECT output ordinal, not by the metadata-extraction
// expression. The JSON key is a bind param that Drizzle re-numbers per clause, so
// reusing it across SELECT and GROUP BY makes them reference different placeholders
// ($1 vs $6) and Postgres rejects the ungrouped column.
describe('topByMetadataKey GROUP BY shape', () => {
  const range = {
    from: new Date('2026-05-01T00:00:00Z'),
    to: new Date('2026-05-08T00:00:00Z'),
  };

  it('groups by the SELECT ordinal, with the metadata key bound only in SELECT + WHERE', () => {
    const { sql, params } = topByMetadataKeyToSQL('referrer', 'page_view', range, 10);

    // GROUP BY references the output-column position, so it cannot diverge from
    // the SELECT expression however the key param is numbered.
    expect(sql.toLowerCase()).toMatch(/group by 1\b/);
    // GROUP BY must not carry a metadata-extraction expression at all.
    expect(sql.toLowerCase()).not.toMatch(/group by[^,]*->>/);
    // The JSON key binds in SELECT + WHERE only — never a third time in GROUP BY.
    expect(params.filter((p) => p === 'referrer')).toHaveLength(2);
  });
});
