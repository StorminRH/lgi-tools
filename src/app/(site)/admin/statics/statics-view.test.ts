import { describe, expect, it } from 'vitest';
import type { PendingWhStaticsReview } from '@/data/wh-statics/queries';
import { resolveNotice } from '@/lib/error-copy';
import {
  differenceLists,
  lineageDifferenceCount,
  lineageLists,
  OUTCOME_LABELS,
  reviewFigures,
} from './statics-view';

const REVIEW: PendingWhStaticsReview = {
  id: 7,
  feedVersion: '42',
  etag: null,
  systemCount: 2604,
  createdAt: new Date('2026-10-08T00:00:00Z'),
  difference: {
    systemsAdded: [{ systemId: 31000001, codes: ['C247', 'D845'] }],
    systemsRemoved: [{ systemId: 31000002, codes: [] }],
    systemsChanged: [{ systemId: 31000003, before: ['H296'], after: [] }],
    codesAdded: ['C247', 'D845'],
    codesRemoved: [],
    totalDifferences: 3,
  },
  crossCheck: {
    agreedSystems: 2600,
    disagreements: [{ systemId: 31000004, feedCodes: ['N062'], lineageCodes: ['N062', 'B274'] }],
    lineageOnlySystems: [31000005, 31000006],
    feedOnlySystems: [],
  },
};

describe('outcome notice', () => {
  it('names each outcome the route sends, including a double-submitted promote, and shows nothing for anything else', () => {
    expect(resolveNotice('promoted', OUTCOME_LABELS)).toBe('The pending statics snapshot was promoted.');
    expect(resolveNotice('snapshot-not-pending', OUTCOME_LABELS)).toBe(
      'That snapshot is no longer pending review, so nothing changed.',
    );
    expect(resolveNotice('snapshot-empty', OUTCOME_LABELS)).toBe(
      'That snapshot has no static assignments, so it was not promoted.',
    );
    expect(resolveNotice('made-up', OUTCOME_LABELS)).toBeNull();
    expect(resolveNotice('constructor', OUTCOME_LABELS)).toBeNull();
    expect(resolveNotice(['promoted'], OUTCOME_LABELS)).toBeNull();
    expect(resolveNotice(undefined, OUTCOME_LABELS)).toBeNull();
  });
});

describe('review lists', () => {
  it('lays out the difference panel, codes per system and code types inline', () => {
    expect(differenceLists(REVIEW)).toEqual([
      { title: 'Systems added, with the codes they gain', items: ['31000001: C247, D845'], wide: false, inline: false },
      { title: 'Systems removed, with the codes they lose', items: ['31000002: none'], wide: false, inline: false },
      { title: 'Systems changed', items: ['31000003: H296 → none'], wide: true, inline: false },
      { title: 'New code types', items: ['C247', 'D845'], wide: false, inline: true },
      { title: 'Removed code types', items: [], wide: false, inline: true },
    ]);
  });

  it('lays out the lineage panel and counts its structural differences', () => {
    expect(lineageLists(REVIEW)).toEqual([
      { title: 'Lineage-only systems', items: ['31000005', '31000006'], wide: false, inline: false },
      { title: 'Feed-only systems', items: [], wide: false, inline: false },
      { title: 'Code-set disagreements', items: ['31000004: feed N062; lineage N062, B274'], wide: true, inline: false },
    ]);
    expect(lineageDifferenceCount(REVIEW)).toBe(3);
  });

  it('sums each side of the diff for the figures row', () => {
    expect(reviewFigures(REVIEW).map((figure) => figure.value)).toEqual([1, 1, 1, 1]);
  });
});
