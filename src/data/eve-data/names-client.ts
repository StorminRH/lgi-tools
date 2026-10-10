import { chunk, sortedUniqueIds } from '@/lib/array';
import { isPositiveSafeInteger } from '@/lib/id-schemas';
import { apiFetch } from '@/transport/api-client';
import type { entityNamesEndpoint, typeNamesEndpoint } from './api-contract';

interface NamesOutcome {
  names: Record<string, string>;
  pending: number[];
}

/** Entity names are mutable and capped per view; type names are static and batched. */
export function createNamesClient(
  endpoint: typeof entityNamesEndpoint | typeof typeNamesEndpoint,
  policy: { maxIds: number; cache: boolean; retryMs?: number },
) {
  const namesById = new Map<number, Promise<string | undefined>>();
  const normalize = (ids: readonly number[]) => {
    const unique = sortedUniqueIds(ids).filter(isPositiveSafeInteger);
    return policy.cache ? unique : unique.slice(0, policy.maxIds);
  };
  async function requestOutcome(ids: number[]): Promise<NamesOutcome> {
    const result = await apiFetch(endpoint, { body: { ids } });
    if (!result.ok) {
      const reason = 'status' in result ? result.status : result.kind;
      throw new Error(`${endpoint.path.includes('type-names') ? 'type' : 'entity'} names ${reason}`);
    }
    return { names: result.data.names, pending: result.data.pending ?? [] };
  }
  const request = async (ids: number[]) => (await requestOutcome(ids)).names;
  /** Names, plus the ids the server could not answer for this time (uncached clients only). */
  async function loadOutcome(ids: readonly number[]): Promise<NamesOutcome> {
    const unique = normalize(ids);
    if (unique.length === 0) return { names: {}, pending: [] };
    if (!policy.cache) return requestOutcome(unique);
    return { names: await loadCached(unique), pending: [] };
  }
  async function load(ids: readonly number[]): Promise<Record<string, string>> {
    return (await loadOutcome(ids)).names;
  }
  async function loadCached(unique: number[]): Promise<Record<string, string>> {
    const missing = unique.filter((id) => !namesById.has(id));
    for (const batch of chunk(missing, policy.maxIds)) {
      const pending = request(batch);
      for (const id of batch) {
        namesById.set(id, pending.then((names) => names[String(id)]).catch((error: unknown) => {
          namesById.delete(id);
          throw error;
        }));
      }
    }
    const names: Record<string, string> = {};
    await Promise.all(unique.map(async (id) => {
      const name = await namesById.get(id);
      if (name !== undefined) names[String(id)] = name;
    }));
    return names;
  }
  return { normalize, load, loadOutcome, retryMs: policy.retryMs };
}
