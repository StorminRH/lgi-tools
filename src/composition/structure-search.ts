import { z } from 'zod';
import type { StructureSearchResult } from '@/features/custom-structures/api-contract';
import { getOrInsertComputed } from '@/lib/array';
import { positiveIdSchema } from '@/lib/id-schemas';
import { getFreshAccessTokenForCharacter } from '@/platform/auth/eve-token-service';
import { EVE_CHARACTER_SEARCH_SCOPE } from '@/platform/auth/eve-sso-constants';
import { listLinkedCharacters, type LinkedCharacter } from '@/platform/auth/linked-characters';
import { deriveScopeHealth } from '@/platform/auth/scope-health';
import { EsiBudgetExhaustedError, esiFetch, esiUrl } from '@/platform/esi';
import { EsiCharacterSearchError, fetchCharacterSearch } from './esi-character-search';

const MAX_STRUCTURE_RESULTS = 8;
const STRUCTURE_SEARCH_SCOPES = [EVE_CHARACTER_SEARCH_SCOPE, 'esi-universe.read_structures.v1'];

const esiStructureSearchSchema = z.object({
  structure: z.array(positiveIdSchema).optional(),
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
  signal?: AbortSignal,
): Promise<StructureSearchResult | null> {
  const response = await esiFetch(esiUrl(`/universe/structures/${structureId}/`), {
    headers: { Authorization: `Bearer ${accessToken}` },
    ...(signal ? { signal } : {}),
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

/** The structures one character's search turns up, before any is read. */
async function structureIdsSeenBy(characterId: number, accessToken: string, search: string, signal?: AbortSignal): Promise<number[]> {
  const body = await fetchCharacterSearch(characterId, accessToken, 'structure', search, signal);
  const parsed = esiStructureSearchSchema.safeParse(body);
  if (!parsed.success) throw new Error('ESI structure search returned an invalid body');
  return parsed.data.structure ?? [];
}

interface CharacterSearch {
  accessToken: string;
  structureIds: number[];
}

async function searchWithCharacter(
  character: LinkedCharacter,
  search: string,
  signal?: AbortSignal,
): Promise<CharacterSearch | null> {
  signal?.throwIfAborted();
  const token = await getFreshAccessTokenForCharacter(character.characterId);
  if (token.kind !== 'ok') return null;
  signal?.throwIfAborted();
  return {
    accessToken: token.accessToken,
    structureIds: await structureIdsSeenBy(character.characterId, token.accessToken, search, signal),
  };
}

async function firstValidSearch(
  characters: readonly LinkedCharacter[],
  search: string,
  signal?: AbortSignal,
): Promise<{ first: CharacterSearch; remaining: readonly LinkedCharacter[] }> {
  for (let index = 0; index < characters.length; index++) {
    try {
      const result = await searchWithCharacter(characters[index]!, search, signal);
      if (result !== null) return { first: result, remaining: characters.slice(index + 1) };
    } catch (error) {
      if (!(error instanceof EsiCharacterSearchError && (error.status === 401 || error.status === 403))) throw error;
    }
  }
  throw new Error('No scoped linked character has a usable ESI access token');
}

/** A structure read with each token whose search saw it, until one is let in. */
async function readWithAny(structureId: number, accessTokens: readonly string[], signal?: AbortSignal): Promise<StructureSearchResult | null> {
  for (const accessToken of accessTokens) {
    signal?.throwIfAborted();
    const structure = await readStructure(structureId, accessToken, signal);
    if (structure) return structure;
  }
  return null;
}

/**
 * Upwell structures any linked character can dock at whose name contains
 * `search`.
 * Characters in the same corporation can have different individual ACLs.
 */
export async function searchUpwellStructures(
  userId: string,
  search: string,
  signal?: AbortSignal,
): Promise<StructureSearchResult[]> {
  const linked = await listLinkedCharacters(userId);
  const scoped = linked.filter(
    (character) => !deriveScopeHealth(character, STRUCTURE_SEARCH_SCOPES).needsReconnect,
  );
  if (scoped.length === 0) return [];

  const { first, remaining } = await firstValidSearch(scoped, search, signal);
  const searched: CharacterSearch[] = [first];
  const outcomes = await Promise.allSettled(
    remaining.map((character) => searchWithCharacter(character, search, signal)),
  );
  signal?.throwIfAborted();
  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') {
      if (outcome.value !== null) searched.push(outcome.value);
    } else if (outcome.reason instanceof EsiBudgetExhaustedError) {
      throw outcome.reason;
    }
  }

  const seenBy = new Map<number, string[]>();
  for (const { accessToken, structureIds } of searched) {
    for (const id of structureIds) getOrInsertComputed(seenBy, id, () => []).push(accessToken);
  }
  const read = await Promise.all(
    [...seenBy].slice(0, MAX_STRUCTURE_RESULTS).map(([id, accessTokens]) => readWithAny(id, accessTokens, signal)),
  );
  return read.filter((structure): structure is StructureSearchResult => structure !== null);
}
