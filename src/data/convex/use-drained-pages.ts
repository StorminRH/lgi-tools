'use client';

// A paginated Convex subscription drained to completion, as a slice hook.
//
// This lives in @/data/convex because that slice owns the browser Convex client and its hooks; a
// consumer imports this instead of `convex/react` (lint-enforced). It is deliberately generic and
// knows nothing about any particular collection.
//
// Draining is SILENT: pages are requested until the cursor exhausts and no loading state is exposed.
// Callers get `complete` instead, which is an honesty flag about the data — a consumer that infers
// removals must wait for it, because a still-draining collection is missing rows it will yet receive.
import {
  useQuery,
  usePaginatedQuery,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  type PaginatedQueryReference,
  type OptionalRestArgsOrSkip,
} from 'convex/react';
import type { FunctionReference, FunctionReturnType } from 'convex/server';
import { useEffect } from 'react';

/** One collection's accumulated rows plus whether every page has landed. */
export interface DrainedPages<Row> {
  readonly rows: readonly Row[];
  /** True once the cursor is exhausted. Only then does an absent row mean a removed row. */
  readonly complete: boolean;
}

/**
 * Subscribes to one paginated query and keeps requesting pages until it is exhausted.
 *
 * Pass `'skip'` to subscribe to nothing. Note that `'skip'` still requires a Convex provider above,
 * so a caller that must tolerate an unconfigured deployment has to keep this hook unmounted rather
 * than relying on the token.
 */
export function useDrainedPages<Query extends PaginatedQueryReference>(
  query: Query,
  args: PaginatedQueryArgs<Query> | 'skip',
  pageSize: number,
): DrainedPages<PaginatedQueryItem<Query>> {
  const { results, status, loadMore } = usePaginatedQuery(query, args, {
    initialNumItems: pageSize,
  });

  useEffect(() => {
    if (status === 'CanLoadMore') loadMore(pageSize);
  }, [status, loadMore, pageSize]);

  return { rows: results, complete: status === 'Exhausted' };
}

/**
 * Subscribes to one non-paginated query, returning `undefined` until its first result lands.
 *
 * The plain-value counterpart to {@link useDrainedPages}, for a subscription whose answer is a value
 * rather than a page — the shape that lets a live query report a state (such as "access is not held")
 * without throwing.
 */
export function useLiveValue<
  Query extends FunctionReference<'query'>,
>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): FunctionReturnType<Query> | undefined {
  return useQuery(query, ...args);
}
