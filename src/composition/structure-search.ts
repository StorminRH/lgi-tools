import { z } from 'zod';
import type { StructureSearchResult } from '@/features/custom-structures/api-contract';
import { getFreshAccessTokenForCharacter } from '@/platform/auth/eve-token-service';
import { EVE_CHARACTER_SEARCH_SCOPE } from '@/platform/auth/eve-sso-constants';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import { deriveScopeHealth } from '@/platform/auth/scope-health';
import { esiFetch, esiUrl } from '@/platform/esi';
import { fetchCharacterSearch } from './esi-character-search';

const MAX_STRUCTURE_RESULTS = 8;
const STRUCTURE_SEARCH_SCOPES = [EVE_CHARACTER_SEARCH_SCOPE, 'esi-universe.read_structures.v1'];

const esiStructureSearchSchema = z.object({
  structure: z.array(z.number().int().positive().safe()).optional(),
});

const esiStructureSchema = z.object({
  name: z.string().min(1),
  solar_system_id: z.number().int().positive(),
  type_id: z.number().int().positive().optional(),
});

/** ESI answers only for structures on the character's access list; anything else is dropped. */
async function readStructure(
  structureId: number,
  accessToken: string,
): Promise<StructureSearchResult | null> {
  const response = await esiFetch(esiUrl(`/universe/structures/${structureId}/`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const parsed = esiStructureSchema.safeParse(await response.json());
  if (!parsed.success) return null;
  return {
    structureId,
    name: parsed.data.name,
    systemId: parsed.data.solar_system_id,
    structureTypeId: parsed.data.type_id ?? null,
  };
}

async function searchWithToken(
  characterId: number,
  accessToken: string,
  search: string,
): Promise<StructureSearchResult[]> {
  const body = await fetchCharacterSearch(characterId, accessToken, 'structure', search);
  const parsed = esiStructureSearchSchema.safeParse(body);
  if (!parsed.success) throw new Error('ESI structure search returned an invalid body');

  const ids = [...new Set(parsed.data.structure ?? [])].slice(0, MAX_STRUCTURE_RESULTS);
  const resolved = await Promise.all(ids.map((id) => readStructure(id, accessToken)));
  return resolved.filter((r): r is StructureSearchResult => r !== null);
}

/**
 * Upwell structures a linked character can access whose name contains `search`.
 * Uses the first linked character holding both search scopes; with none, there
 * is nothing ESI will show us, so the answer is empty rather than an error.
 */
export async function searchUpwellStructures(
  userId: string,
  search: string,
): Promise<StructureSearchResult[]> {
  const linked = await listLinkedCharacters(userId);
  const scoped = linked.filter(
    (character) => !deriveScopeHealth(character, STRUCTURE_SEARCH_SCOPES).needsReconnect,
  );
  if (scoped.length === 0) return [];

  for (const character of scoped) {
    const token = await getFreshAccessTokenForCharacter(character.characterId);
    if (token.kind === 'ok') {
      return searchWithToken(character.characterId, token.accessToken, search);
    }
  }
  throw new Error('No scoped linked character has a usable ESI access token');
}
