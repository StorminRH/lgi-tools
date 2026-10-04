import { expect, test } from 'vitest';
import { filterCodexIndex, type CodexIndexRow } from './index-search';

const C247: CodexIndexRow = { kind: 'wormholes', key: 'c247', title: 'C247' };
const SITE: CodexIndexRow = { kind: 'sites', key: '20', title: 'Outpost Frontier Stronghold' };
const THERA: CodexIndexRow = { kind: 'classes', key: 'thera', title: 'Thera' };
const ROWS = [C247, SITE, THERA];

test('matches titles and keys without regard to case or padding', () => {
  expect(filterCodexIndex(ROWS, 'c2')).toEqual([C247]);
  expect(filterCodexIndex(ROWS, 'outpost')).toEqual([SITE]);
  expect(filterCodexIndex(ROWS, 'THERA')).toEqual([THERA]);
});

test('returns nothing for a blank or unmatched query', () => {
  expect(filterCodexIndex(ROWS, '')).toEqual([]);
  expect(filterCodexIndex(ROWS, '  ')).toEqual([]);
  expect(filterCodexIndex(ROWS, 'zzz')).toEqual([]);
});

test('caps the result list at fifty rows', () => {
  const many = Array.from({ length: 60 }, (_, index): CodexIndexRow => ({
    kind: 'guides',
    key: `guide-${index}`,
    title: `Rolling a C${index}`,
  }));
  expect(filterCodexIndex(many, 'a')).toHaveLength(50);
});
