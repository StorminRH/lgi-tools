'use client';

import { useQuery, type OptionalRestArgsOrSkip } from 'convex/react';
import type { FunctionReference, FunctionReturnType } from 'convex/server';

export function useLiveValue<
  Query extends FunctionReference<'query'>,
>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): FunctionReturnType<Query> | undefined {
  return useQuery(query, ...args);
}
