'use client';

import { useQuery, type OptionalRestArgsOrSkip } from 'convex/react';
import type { FunctionReference, FunctionReturnType } from 'convex/server';
import { useHydrating } from '@/lib/use-hydrating';

export function useLiveValue<
  Query extends FunctionReference<'query'>,
>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): FunctionReturnType<Query> | undefined {
  const value = useQuery(query, ...args);
  // The server renders every live value as still loading; a boundary that
  // hydrates after the client cached a result must match that.
  return useHydrating() ? undefined : value;
}
