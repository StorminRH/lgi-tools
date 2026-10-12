import { isDue } from '@/data/esi-store';
import { runAfterResponse } from '@/lib/after-response';
import { refreshCostIndicesOnView } from './ingest';
import { COST_INDICES_KEY } from './keys';
import { getSystemCostIndicesBatch } from './queries';
import type { SystemCostIndices } from './types';

/**
 * The stored cost indices for a view, refreshed behind the response when
 * CCP's expiry has passed so the next view shows the new ones. Its callers
 * are route handlers, which already run at request time.
 */
export async function getSystemCostIndicesOnView(
  systemIds: number[],
): Promise<Map<number, SystemCostIndices>> {
  const [indices, due] = await Promise.all([getSystemCostIndicesBatch(systemIds), isDue([COST_INDICES_KEY])]);
  if (due) runAfterResponse('industry-indices', 'cost indices refresh', refreshCostIndicesOnView);
  return indices;
}
