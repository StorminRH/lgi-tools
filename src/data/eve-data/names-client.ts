import { chunk, sortedUniqueIds } from '@/lib/array';
import { apiFetchData } from '@/transport/api-fetch-data';
import {
  ENTITY_NAMES_MAX_IDS,
  TYPE_NAMES_MAX_IDS,
  entityNamesEndpoint,
  typeNamesEndpoint,
} from './api-contract';

interface NamesOutcome {
  names: Record<string, string>;
  pending: number[];
}

interface NamesPolicy {
  /** Names the endpoint in a failed lookup's error, as `<label> names <failure>`, such as `type names api 503`. */
  label: 'type' | 'entity';
  maxIds: number;
  cache: boolean;
  retryMs?: number;
}

/** One names endpoint behind a policy: a cached client batches and keeps every answer, an uncached one asks again on each load for at most `maxIds` ids. */
function createNamesClient(
  endpoint: typeof entityNamesEndpoint | typeof typeNamesEndpoint,
  policy: NamesPolicy,
) {
  const namesById = new Map<number, Promise<string | undefined>>();
  // The endpoint's own id schema, so an id its server would refuse never sinks the rest of a batch.
  const idSchema = endpoint.request.shape.ids.element;
  const normalize = (ids: readonly number[]) => {
    const unique = sortedUniqueIds(ids).filter((id) => idSchema.safeParse(id).success);
    return policy.cache ? unique : unique.slice(0, policy.maxIds);
  };
  async function requestOutcome(ids: number[]): Promise<NamesOutcome> {
    const data = await apiFetchData(endpoint, `${policy.label} names`, { body: { ids } });
    return { names: data.names, pending: data.pending ?? [] };
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

/** Type names come from the SDE and never change, so each id is asked for once, in batches of the request cap. */
export const typeNamesClient = createNamesClient(typeNamesEndpoint, {
  label: 'type',
  maxIds: TYPE_NAMES_MAX_IDS,
  cache: true,
  retryMs: 15_000,
});

/** Character, corporation and alliance names can change, so every load asks again. */
export const entityNamesClient = createNamesClient(entityNamesEndpoint, {
  label: 'entity',
  maxIds: ENTITY_NAMES_MAX_IDS,
  cache: false,
  // A rate-limited or failed lookup tries again rather than leaving names blank.
  retryMs: 30_000,
});
