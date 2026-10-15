'use client';

import { formatRelativeTime } from '@/lib/format/time';
import { useHydrating } from '@/lib/use-hydrating';
import { useNow } from '@/lib/use-now';

const AGE_TICK_MS = 60_000;

/**
 * How long ago prices last updated, by the browser clock. The server and the
 * hydration render show `—` without reading the clock: with Cache Components a
 * clock read in a prerender or a prefetch is an error, and hydration must match
 * the server HTML. The age appears once this component hydrates and advances
 * each minute.
 */
export function PriceUpdateAge({ updatedAt }: { updatedAt: Date | null }) {
  return useHydrating() || updatedAt === null ? '—' : <TickingAge updatedAt={updatedAt} />;
}

function TickingAge({ updatedAt }: { updatedAt: Date }) {
  return formatRelativeTime(updatedAt, useNow(AGE_TICK_MS));
}
