import { expect, test } from 'vitest';
import { clampPageSize, deniedPage, MAP_CHAIN_MAX_PAGE_SIZE } from './pagination';

test('clampPageSize bounds the requested page size to [1, max] and keeps the cursor fields', () => {
  const opts = { cursor: 'cursor-7', endCursor: null, numItems: 25 };

  expect(clampPageSize(opts, MAP_CHAIN_MAX_PAGE_SIZE)).toEqual(opts);
  expect(clampPageSize({ ...opts, numItems: 0 }, 40).numItems).toBe(1);
  expect(clampPageSize({ ...opts, numItems: -5 }, 40).numItems).toBe(1);
  expect(clampPageSize({ ...opts, numItems: 41 }, 40)).toEqual({ ...opts, numItems: 40 });
  expect(clampPageSize({ ...opts, numItems: 40 }, 40).numItems).toBe(40);
  // The caller's options object is copied, never mutated.
  expect(clampPageSize(opts, 10)).toEqual({ ...opts, numItems: 10 });
  expect(opts.numItems).toBe(25);
});

test('deniedPage is an empty, finished page with an empty cursor', () => {
  expect(deniedPage<{ id: string }>()).toEqual({ page: [], isDone: true, continueCursor: '' });
});
