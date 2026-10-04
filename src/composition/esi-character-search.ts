import { esiFetch, esiUrl } from '@/platform/esi';

export class EsiCharacterSearchError extends Error {
  constructor(category: 'character' | 'structure', public readonly status: number) {
    super(`Scoped ESI ${category} search failed (${status})`);
  }
}

/**
 * ESI's authenticated search for one category, as the raw body. The token's
 * character decides what is visible (structures: only ones it can access).
 */
export async function fetchCharacterSearch(
  characterId: number,
  accessToken: string,
  category: 'character' | 'structure',
  search: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const query = new URLSearchParams({ categories: category, search, strict: 'false' });
  const response = await esiFetch(
    esiUrl(`/characters/${characterId}/search/?${query.toString()}`),
    { headers: { Authorization: `Bearer ${accessToken}` }, ...(signal ? { signal } : {}) },
  );
  if (!response.ok) throw new EsiCharacterSearchError(category, response.status);
  return response.json();
}
