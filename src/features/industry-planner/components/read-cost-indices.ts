import { readWithRetries } from '@/lib/retry';
import { apiFetch } from '@/transport/api-client';
import { costIndicesEndpoint } from '../api-contract';
import type { SystemJobCostIndex } from '../types';

/**
 * Each system's job cost indices, by system, in one read that retries a
 * passing blip. Null once every attempt has failed, or when the read is
 * cancelled.
 */
export async function readCostIndices(
  systemIds: number[],
  signal: AbortSignal,
): Promise<ReadonlyMap<number, SystemJobCostIndex> | null> {
  const data = await readWithRetries(async () => {
    const res = await apiFetch(costIndicesEndpoint, {
      body: { systemIds },
      cache: 'no-store',
      signal,
    });
    return res.ok ? res.data : null;
  }, signal);
  return data ? new Map(data.systems.map((system) => [system.systemId, system])) : null;
}
