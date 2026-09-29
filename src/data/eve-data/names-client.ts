import { apiFetch } from '@/transport/api-client';
import type { entityNamesEndpoint, typeNamesEndpoint } from './api-contract';

/** Entity names are mutable and capped per view; type names are static and batched. */
export function createNamesClient(
  endpoint: typeof entityNamesEndpoint | typeof typeNamesEndpoint,
  policy: { maxIds: number; cache: boolean; retryMs?: number },
) {
  const namesById = new Map<number, Promise<string | undefined>>();
  const normalize = (ids: readonly number[]) => {
    const unique = [...new Set(ids)].sort((left, right) => left - right);
    return policy.cache
      ? unique.filter((id) => Number.isInteger(id) && id > 0)
      : unique.slice(0, policy.maxIds);
  };
  async function request(ids: number[]): Promise<Record<string, string>> {
    const result = await apiFetch(endpoint, { body: { ids } });
    if (!result.ok) {
      const reason = 'status' in result ? result.status : result.kind;
      throw new Error(`${endpoint.path.includes('type-names') ? 'type' : 'entity'} names ${reason}`);
    }
    return result.data.names;
  }
  async function load(ids: readonly number[]): Promise<Record<string, string>> {
    const unique = normalize(ids);
    if (unique.length === 0) return {};
    if (!policy.cache) return request(unique);
    const missing = unique.filter((id) => !namesById.has(id));
    for (let start = 0; start < missing.length; start += policy.maxIds) {
      const batch = missing.slice(start, start + policy.maxIds);
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
  return { normalize, load, retryMs: policy.retryMs };
}
