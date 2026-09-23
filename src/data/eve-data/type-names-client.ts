import { apiFetch } from '@/transport/api-client';
import { TYPE_NAMES_MAX_IDS, typeNamesEndpoint } from './api-contract';

const namesById = new Map<number, Promise<string | undefined>>();

export async function loadTypeNames(ids: readonly number[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)]
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((left, right) => left - right);
  const missing = unique.filter((id) => !namesById.has(id));
  for (let start = 0; start < missing.length; start += TYPE_NAMES_MAX_IDS) {
    const batch = missing.slice(start, start + TYPE_NAMES_MAX_IDS);
    const request = apiFetch(typeNamesEndpoint, { body: { ids: batch } }).then((result) => {
      if (!result.ok) {
        const reason = 'status' in result ? result.status : result.kind;
        throw new Error(`type names ${reason}`);
      }
      return result.data.names;
    });
    for (const id of batch) {
      namesById.set(id, request.then((names) => names[String(id)]).catch((error: unknown) => {
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
