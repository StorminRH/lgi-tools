import { apiFetch } from '@/transport/api-client';
import { TYPE_NAMES_MAX_IDS, typeNamesEndpoint } from './api-contract';

function uniqueTypeIds(ids: readonly number[]): number[] {
  return [...new Set(ids)]
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((left, right) => left - right)
    .slice(0, TYPE_NAMES_MAX_IDS);
}

export async function loadTypeNames(
  ids: readonly number[],
): Promise<Record<string, string>> {
  const unique = uniqueTypeIds(ids);
  if (unique.length === 0) return {};
  const result = await apiFetch(typeNamesEndpoint, { body: { ids: unique } });
  if (!result.ok) {
    const reason = 'status' in result ? result.status : result.kind;
    throw new Error(`type names ${reason}`);
  }
  return result.data.names;
}
