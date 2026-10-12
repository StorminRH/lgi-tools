import { z } from 'zod';
import { EVE_CHARACTER_SEARCH_SCOPE } from '@/config/eve-scopes';
import type { SearchCharactersResponse } from '@/data/maps/api-contract';
import { resolveEntityNamesStrict } from '@/data/eve-data/entity-names';
import { characterPortraitUrl } from '@/lib/eve-image';
import { positiveIdSchema } from '@/lib/id-schemas';
import { esiFetch, esiUrl } from '@/platform/esi';
import { esiJsonPostInit } from '@/platform/esi/request-init';
import { firstScopedSearch, scopedLinkedCharacters } from './esi-character-search';

const MAX_TYPEAHEAD_RESULTS = 20;

const universeIdsSchema = z.object({
  characters: z
    .array(
      z.object({
        id: positiveIdSchema,
        name: z.string().min(1),
      }),
    )
    .optional(),
});

function uniqueIds(ids: readonly number[]): number[] {
  return [...new Set(ids)].slice(0, MAX_TYPEAHEAD_RESULTS);
}

/** The typeahead results for a scoped search's first hits, with their names. */
async function typeaheadResponse(found: readonly number[]): Promise<SearchCharactersResponse> {
  const ids = uniqueIds(found);
  const names = await resolveEntityNamesStrict(ids);
  return {
    mode: 'typeahead',
    results: ids.flatMap((characterId) => {
      const name = names[String(characterId)];
      return name === undefined
        ? []
        : [{ characterId, name, portraitUrl: characterPortraitUrl(characterId) }];
    }),
  };
}

async function searchExactName(search: string): Promise<SearchCharactersResponse> {
  const response = await esiFetch(esiUrl('/universe/ids/'), esiJsonPostInit([search]));
  if (!response.ok) throw new Error(`Exact ESI character search failed (${response.status})`);

  const parsed = universeIdsSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Exact ESI character search returned an invalid body');

  const results = (parsed.data.characters ?? []).map((character) => ({
    characterId: character.id,
    name: character.name,
    portraitUrl: characterPortraitUrl(character.id),
  }));
  return { mode: 'exact', results };
}

export async function searchMapCharacters(
  userId: string,
  search: string,
  signal?: AbortSignal,
): Promise<SearchCharactersResponse> {
  const scoped = await scopedLinkedCharacters(userId, [EVE_CHARACTER_SEARCH_SCOPE]);
  if (scoped.length === 0) return searchExactName(search);

  const { first } = await firstScopedSearch(scoped, 'character', search, signal);
  return typeaheadResponse(first.ids);
}
