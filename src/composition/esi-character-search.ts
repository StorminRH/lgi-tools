import { esiFetch, esiUrl } from '@/platform/esi';

/**
 * ESI's authenticated search for one category, as the raw body. The token's
 * character decides what is visible (structures: only ones it can access).
 */
export async function fetchCharacterSearch(
  characterId: number,
  accessToken: string,
  category: 'character' | 'structure',
  search: string,
): Promise<unknown> {
  const query = new URLSearchParams({ categories: category, search, strict: 'false' });
  const response = await esiFetch(
    esiUrl(`/characters/${characterId}/search/?${query.toString()}`),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`Scoped ESI ${category} search failed (${response.status})`);
  return response.json();
}
