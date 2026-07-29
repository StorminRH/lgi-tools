import { describe, expect, it } from 'vitest';
import { deriveGscCoverageView, isIndexedVerdict } from './gsc-coverage-view';

describe('isIndexedVerdict', () => {
  it.each([
    ['PASS', true],
    ['NEUTRAL', false],
    ['FAIL', false],
    ['VERDICT_UNSPECIFIED', false],
    [null, false],
  ])('classifies %s as indexed=%s', (verdict, expected) => {
    expect(isIndexedVerdict(verdict)).toBe(expected);
  });
});

describe('deriveGscCoverageView', () => {
  it('groups unknown reasons, sorts non-indexed first, and orders trends chronologically', () => {
    const view = deriveGscCoverageView({
      latest: [
        {
          inspectionDate: '2026-07-12',
          url: 'https://lgi.tools/indexed',
          verdict: 'PASS',
          coverageState: 'Submitted and indexed',
          lastCrawlTime: null,
        },
        {
          inspectionDate: null,
          url: 'https://lgi.tools/unknown',
          verdict: null,
          coverageState: null,
          lastCrawlTime: null,
        },
        {
          inspectionDate: '2026-07-12',
          url: 'https://lgi.tools/excluded',
          verdict: 'NEUTRAL',
          coverageState: 'Crawled - currently not indexed',
          lastCrawlTime: null,
        },
      ],
      trend: [
        { day: '2026-07-12', indexed: 1, notIndexed: 2 },
        { day: '2026-07-10', indexed: 0, notIndexed: 3 },
      ],
    });

    expect(view).toMatchObject({ total: 3, indexed: 1, notIndexed: 2 });
    expect(view.rows.map((row) => row.url)).toEqual([
      'https://lgi.tools/excluded',
      'https://lgi.tools/unknown',
      'https://lgi.tools/indexed',
    ]);
    expect(view.reasons).toEqual([
      { key: 'Crawled - currently not indexed', label: 'Crawled - currently not indexed', count: 1 },
      { key: 'Submitted and indexed', label: 'Submitted and indexed', count: 1 },
      { key: 'Unknown', label: 'Unknown', count: 1 },
    ]);
    expect(view.indexedTrend.labels).toEqual(['2026-07-10', '2026-07-12']);
    expect(view.indexedTrend.points.map((point) => point.y)).toEqual([0, 1]);
    expect(view.notIndexedTrend.points.map((point) => point.y)).toEqual([3, 2]);
  });
});
