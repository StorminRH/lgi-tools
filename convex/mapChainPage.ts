import type { PaginationResult } from 'convex/server';

/**
 * The largest page either chain subscription will serve, whatever a caller asks for.
 *
 * A page is a transaction-bounded unit of read I/O, and DB I/O is the binding capacity constraint
 * (`docs/CONVEX.md`), so a bigger map costs more calls rather than one bigger, riskier transaction.
 */
export const MAP_CHAIN_MAX_PAGE_SIZE = 100;

/**
 * Clamps a client's requested page size into `[1, MAP_CHAIN_MAX_PAGE_SIZE]`.
 *
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

/** A complete, empty page: what a chain read serves a caller holding no claim. */
export function deniedPage<Row>(): PaginationResult<Row> {
  return { page: [], isDone: true, continueCursor: '' };
}
