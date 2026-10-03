import { z } from 'zod';
import type { StructureSearchResult } from '@/features/custom-structures/api-contract';
import { getFreshAccessTokenForCharacter } from '@/platform/auth/eve-token-service';
import { EVE_CHARACTER_SEARCH_SCOPE } from '@/platform/auth/eve-sso-constants';
import { listLinkedCharacters, type LinkedCharacter } from '@/platform/auth/linked-characters';
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

/** The structures one character's search turns up, before any is read. */
async function structureIdsSeenBy(characterId: number, accessToken: string, search: string): Promise<number[]> {
  const body = await fetchCharacterSearch(characterId, accessToken, 'structure', search);
  const parsed = esiStructureSearchSchema.safeParse(body);
  if (!parsed.success) throw new Error('ESI structure search returned an invalid body');
  return parsed.data.structure ?? [];
}

/**
 * Corp-mates dock at the same public, corporation and alliance structures,
 * so one character searches for each corporation. A character with no
 * known corporation searches for itself.
 */
function byCorporation(characters: readonly LinkedCharacter[]): LinkedCharacter[][] {
  const groups = new Map<string, LinkedCharacter[]>();
  for (const character of characters) {
    const key = character.corporationId != null ? `corporation:${character.corporationId}` : `character:${character.characterId}`;
    groups.set(key, [...(groups.get(key) ?? []), character]);
  }
  return [...groups.values()];
}

/** Searches a corporation tries before it gives up; a character without a usable token is passed over free. */
const SEARCHES_PER_CORPORATION = 2;

interface CorporationSearch {
  accessToken: string;
  structureIds: number[];
}

/** One corporation's search: its first character that can search, the next stepping in when one fails. */
async function searchForCorporation(
  members: readonly LinkedCharacter[],
  search: string,
): Promise<CorporationSearch | Error> {
  let failure = new Error('No scoped linked character has a usable ESI access token');
  let attempts = 0;
  for (const { characterId } of members) {
    if (attempts === SEARCHES_PER_CORPORATION) break;
    const token = await getFreshAccessTokenForCharacter(characterId);
    if (token.kind !== 'ok') continue;
    attempts++;
    try {
      return { accessToken: token.accessToken, structureIds: await structureIdsSeenBy(characterId, token.accessToken, search) };
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
  }
  return failure;
}

/** A structure read with each token whose search saw it, until one is let in. */
async function readWithAny(structureId: number, accessTokens: readonly string[]): Promise<StructureSearchResult | null> {
  for (const accessToken of accessTokens) {
    const structure = await readStructure(structureId, accessToken);
    if (structure) return structure;
  }
  return null;
}

/**
 * Upwell structures any linked character can dock at whose name contains
 * `search`. One character searches per corporation, every corporation at
 * once and each on its own, so one failing does not stop the rest; the
 * search fails only when every corporation's does. Each structure found is
 * read once. With no scoped character ESI shows us nothing, so the answer
 * is empty.
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

  const outcomes = await Promise.all(byCorporation(scoped).map((members) => searchForCorporation(members, search)));
  const searched = outcomes.filter((outcome): outcome is CorporationSearch => !(outcome instanceof Error));
  if (searched.length === 0) throw outcomes[0]!;

  const seenBy = new Map<number, string[]>();
  for (const { accessToken, structureIds } of searched) {
    for (const id of structureIds) seenBy.set(id, [...(seenBy.get(id) ?? []), accessToken]);
  }
  const read = await Promise.all(
    [...seenBy].slice(0, MAX_STRUCTURE_RESULTS).map(([id, accessTokens]) => readWithAny(id, accessTokens)),
  );
  return read.filter((structure): structure is StructureSearchResult => structure !== null);
}
