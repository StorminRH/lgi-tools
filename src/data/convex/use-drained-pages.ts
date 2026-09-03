'use client';

import {
  usePaginatedQuery,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  type PaginatedQueryReference,
} from 'convex/react';
import { useEffect } from 'react';

export interface DrainedPages<Row> {
  readonly rows: readonly Row[];
  readonly complete: boolean;
}

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
