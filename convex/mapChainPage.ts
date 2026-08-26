import type { PaginationResult } from 'convex/server';

/** The largest page either chain subscription will serve, whatever a caller asks for. */
export const MAP_CHAIN_MAX_PAGE_SIZE = 100;

/**
 * The bound is enforced here in the handler body rather than in the validator on purpose: the
 * client pagination hook injects its own bookkeeping fields into `paginationOpts`, so the argument
 * must be validated by Convex's own `paginationOptsValidator` and narrowed afterwards.
 */
export function clampPageSize<T extends { numItems: number }>(paginationOpts: T): T {
  return {
    ...paginationOpts,
    numItems: Math.max(1, Math.min(paginationOpts.numItems, MAP_CHAIN_MAX_PAGE_SIZE)),
  };
}

export function deniedPage<Row>(): PaginationResult<Row> {
  return { page: [], isDone: true, continueCursor: '' };
}
