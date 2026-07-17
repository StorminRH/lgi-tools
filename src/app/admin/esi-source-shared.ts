import { cache } from 'react';
import {
  getBudgetExhaustionCount,
  getFallbackRate,
} from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';

const readFallbackRate = cache(async (from: string, to: string) =>
  await getFallbackRate({ from: new Date(from), to: new Date(to) }),
);

const readBudgetExhaustions = cache(async (from: string, to: string) =>
  await getBudgetExhaustionCount({ from: new Date(from), to: new Date(to) }),
);

/**
 * Reads fallback rate shared through the App Router owner rather than exposing its storage
 * details. Storage and transport failures remain visible to the caller.
 */
export function getFallbackRateShared(range: DateRange) {
  return readFallbackRate(range.from.toISOString(), range.to.toISOString());
}

/**
 * Reads budget exhaustion count shared through the App Router owner rather than exposing its
 * storage details. Storage and transport failures remain visible to the caller.
 */
export function getBudgetExhaustionCountShared(range: DateRange) {
  return readBudgetExhaustions(range.from.toISOString(), range.to.toISOString());
}
