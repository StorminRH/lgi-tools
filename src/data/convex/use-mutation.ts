'use client';

import type { OptimisticLocalStore } from 'convex/browser';
import type { FunctionReference, PaginationOptions } from 'convex/server';
import { convexToJson, type Value } from 'convex/values';

export type { OptimisticLocalStore } from 'convex/browser';
export {
  insertAtBottomIfLoaded,
  insertAtTop,
  optimisticallyUpdateValueInPaginatedQuery,
  useMutation,
} from 'convex/react';

function innerQueryArgs(args: { paginationOpts: PaginationOptions }): string {
  const { paginationOpts: _paginationOpts, ...innerArgs } = args;
  return JSON.stringify(convexToJson(innerArgs as Value));
}

export function removeFromPaginatedQuery<
  Query extends FunctionReference<
    'query',
    'public',
    { paginationOpts: PaginationOptions },
    { page: unknown[] }
  >,
  Item = Query['_returnType']['page'][number],
>(
  localStore: OptimisticLocalStore,
  query: Query,
  args: Omit<Query['_args'], 'paginationOpts'>,
  shouldRemove: (item: Item) => boolean,
): void {
  const expectedArgs = JSON.stringify(convexToJson(args as Value));
  for (const queryResult of localStore.getAllQueries(query)) {
    if (queryResult.value === undefined) continue;
    const value = queryResult.value;
    if (typeof value !== 'object' || value === null || !Array.isArray(value.page)) {
      continue;
    }
    if (innerQueryArgs(queryResult.args as { paginationOpts: PaginationOptions })
      !== expectedArgs) {
      continue;
    }
    localStore.setQuery(query, queryResult.args, {
      ...value,
      page: value.page.filter((item) => !shouldRemove(item as Item)),
    });
  }
}
