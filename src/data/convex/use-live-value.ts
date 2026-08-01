'use client';

// One non-paginated Convex subscription, as a slice hook.
//
// Lives in @/data/convex because that slice owns the browser Convex client and its hooks
// (lint-enforced). It sits in its own module so the next consumer that needs a plain live value finds
// it by name instead of reaching for `convex/react` or adding a second exemption.
import { useQuery, type OptionalRestArgsOrSkip } from 'convex/react';
import type { FunctionReference, FunctionReturnType } from 'convex/server';

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
