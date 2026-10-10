import { z } from 'zod';
import { EVE_CHARACTER_SEARCH_SCOPE } from '@/config/eve-scopes';
import type { SearchCharactersResponse } from '@/data/maps/api-contract';
import { resolveEntityNamesStrict } from '@/data/eve-data/entity-names';
import { characterPortraitUrl } from '@/lib/eve-image';
import { positiveIdSchema } from '@/lib/id-schemas';
import { getFreshAccessTokenForCharacter } from '@/platform/auth/eve-token-service';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import { deriveScopeHealth } from '@/platform/auth/scope-health';
import { esiFetch, esiUrl } from '@/platform/esi';
import { fetchCharacterSearch } from './esi-character-search';

const MAX_TYPEAHEAD_RESULTS = 20;

const esiCharacterSearchSchema = z.object({
  character: z.array(positiveIdSchema).optional(),
});

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

async function searchWithScopedToken(
  characterId: number,
  accessToken: string,
  search: string,
): Promise<SearchCharactersResponse> {
  const body = await fetchCharacterSearch(characterId, accessToken, 'character', search);
  const parsed = esiCharacterSearchSchema.safeParse(body);
  if (!parsed.success) throw new Error('Scoped ESI character search returned an invalid body');

  const ids = uniqueIds(parsed.data.character ?? []);
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
  const response = await esiFetch(esiUrl('/universe/ids/'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([search]),
  });
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
): Promise<SearchCharactersResponse> {
  const linked = await listLinkedCharacters(userId);
  const scoped = linked.filter(
    (character) =>
      !deriveScopeHealth(character, [EVE_CHARACTER_SEARCH_SCOPE]).needsReconnect,
  );
  if (scoped.length === 0) return searchExactName(search);

  for (const character of scoped) {
    const token = await getFreshAccessTokenForCharacter(character.characterId);
    if (token.kind === 'ok') {
      return searchWithScopedToken(character.characterId, token.accessToken, search);
    }
  }
  throw new Error('No scoped linked character has a usable ESI access token');
}
