import { describe, expect, it } from 'vitest';
import { indexStatusToRecord, searchRowsToRecords, sitemapToRecord, syncGsc } from './ingest';

const SYNCED = new Date('2026-06-04T09:00:00.000Z');

describe('searchRowsToRecords', () => {
  it('maps daily-total rows to an empty key', () => {
    const records = searchRowsToRecords(
      [{ keys: ['2026-06-01'], clicks: 3, impressions: 40, ctr: 0.075, position: 8.2 }],
      'total',
      SYNCED,
    );
    expect(records).toEqual([
      {
        date: '2026-06-01',
        dimension: 'total',
        key: '',
        clicks: 3,
        impressions: 40,
        position: 8.2,
        syncedAt: SYNCED,
      },
    ]);
  });

  it('maps query rows to keys[1] and rounds fractional counts', () => {
    const [rec] = searchRowsToRecords(
      [{ keys: ['2026-06-01', 'rifter blueprint'], clicks: 2.6, impressions: 19.4, ctr: 0.13, position: 4.5 }],
      'query',
      SYNCED,
    );
    expect(rec).toMatchObject({
      dimension: 'query',
      key: 'rifter blueprint',
      clicks: 3,
      impressions: 19,
    });
  });

  it('drops rows with no date key', () => {
    expect(
      searchRowsToRecords([{ clicks: 1, impressions: 1, ctr: 1, position: 1 }], 'total', SYNCED),
    ).toEqual([]);
  });
});

describe('sitemapToRecord', () => {
  it('sums contents (string-coerced int64) and parses the download time', () => {
    const rec = sitemapToRecord(
      {
        path: 'https://lgi.tools/sitemap.xml',
        lastDownloaded: '2026-06-02T05:00:00Z',
        contents: [
          { type: 'web', submitted: '70', indexed: '63' },
          { type: 'web', submitted: 3, indexed: 2 },
        ],
        warnings: '1',
        errors: '0',
      },
      SYNCED,
    );
    expect(rec).toMatchObject({
      path: 'https://lgi.tools/sitemap.xml',
      submitted: 73,
      indexed: 65,
      warnings: 1,
      errors: 0,
      isPending: false,
    });
    expect(rec.lastDownloaded?.toISOString()).toBe('2026-06-02T05:00:00.000Z');
  });

  it('defaults missing fields', () => {
    expect(sitemapToRecord({ path: '/s.xml' }, SYNCED)).toMatchObject({
      submitted: 0,
      indexed: 0,
      warnings: 0,
      errors: 0,
      isPending: false,
      isSitemapsIndex: false,
      type: null,
      lastDownloaded: null,
      lastSubmitted: null,
    });
  });
});

describe('indexStatusToRecord', () => {
  it('maps index-status fields, nulls the absent ones, and parses lastCrawlTime', () => {
    const rec = indexStatusToRecord(
      'https://lgi.tools/',
      {
        verdict: 'PASS',
        coverageState: 'Submitted and indexed',
        lastCrawlTime: '2026-06-01T12:00:00Z',
        googleCanonical: 'https://lgi.tools/',
      },
      SYNCED,
    );
    expect(rec).toMatchObject({
      url: 'https://lgi.tools/',
      verdict: 'PASS',
      coverageState: 'Submitted and indexed',
      googleCanonical: 'https://lgi.tools/',
      robotsTxtState: null,
      userCanonical: null,
    });
    expect(rec.lastCrawlTime?.toISOString()).toBe('2026-06-01T12:00:00.000Z');
  });
});

describe('syncGsc', () => {
  it('skips cleanly when the credential is not configured', async () => {
    const keys = ['GSC_SERVICE_ACCOUNT_JSON', 'GSC_SITE_URL'] as const;
    const saved = keys.map((k) => process.env[k]);
    for (const k of keys) delete process.env[k];
    try {
      // The not-configured path returns before touching the client.
      const summary = await syncGsc({} as unknown as Parameters<typeof syncGsc>[0]);
      expect(summary.status).toBe('skipped');
      expect(summary.reason).toBe('not_configured');
      expect(summary.searchRows).toBe(0);
    } finally {
      keys.forEach((k, i) => {
        if (saved[i] !== undefined) process.env[k] = saved[i];
      });
    }
  });
});
