'use client';

import { createContext, useContext } from 'react';

// Shared nav state for the browse cascade. Lives in its own module so the
// catalog rows (column 0) and the fanned input columns can both consume it
// without importing — and cycling through — BrowseCascade, which renders them.
//
// `path` is the open drill chain as blueprint-id strings (the same value
// `useCascadePath` carries in `?browse=`). `openFrom(depth, blueprintId)`
// opens that blueprint's column at `depth`, dropping anything deeper; clicking
// the already-open id at that depth collapses back to it. A row is "open" when
// `path[depth] === String(blueprintId)`.
export interface CascadeNav {
  path: string[];
  openFrom: (depth: number, blueprintId: number) => void;
  // Client clock for price freshness, filled after hydration so the prerender
  // never reads the wall clock (Cache Components forbids it; the purity rule
  // forbids Date.now() in render). Null until then — columns show an unknown
  // confidence dot until the clock lands. Mirrors PricingProvider.
  now: number | null;
}

export const CascadeContext = createContext<CascadeNav | null>(null);

export function useCascadeNav(): CascadeNav {
  const ctx = useContext(CascadeContext);
  if (!ctx) throw new Error('useCascadeNav must be used within a BrowseCascade');
  return ctx;
}
