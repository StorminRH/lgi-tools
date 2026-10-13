import type { PaginationResult } from 'convex/server';

export const MAP_CHAIN_MAX_PAGE_SIZE = 100;

/** Clamps a client page size to [1, max]; each subscription passes its own bound. */
export function clampPageSize<T extends { numItems: number }>(paginationOpts: T, max: number): T {
  return {
    ...paginationOpts,
    numItems: Math.max(1, Math.min(paginationOpts.numItems, max)),
  };
}

export function deniedPage<Row>(): PaginationResult<Row> {
  return { page: [], isDone: true, continueCursor: '' };
}
