import { z } from 'zod';
import type { EveScope } from '@/config/eve-scopes';
import { esiPassThrough } from '@/data/esi-store';
import { positiveIdSchema } from '@/lib/id-schemas';
import { getFreshAccessTokenForCharacter } from '@/platform/auth/eve-token-service';
import { listLinkedCharacters, type LinkedCharacter } from '@/platform/auth/linked-characters';
import { deriveScopeHealth } from '@/platform/auth/scope-health';
import { esiAuthInit } from '@/platform/esi/request-init';

/** ESI answers only the category asked for, so the other key stays absent. */
const esiSearchBodySchema = z.object({
  character: z.array(positiveIdSchema).optional(),
  structure: z.array(positiveIdSchema).optional(),
});

class EsiCharacterSearchError extends Error {
  constructor(category: 'character' | 'structure', public readonly status: number) {
    super(`Scoped ESI ${category} search failed (${status})`);
  }
}

/** A search ESI refused for this character's grant; another character may still be let in. */
function isRefusedSearch(error: unknown): boolean {
  return error instanceof EsiCharacterSearchError && (error.status === 401 || error.status === 403);
}

/**
 * ESI's authenticated search for one category, as the ids it found. The
 * token's character decides what is visible (structures: only ones it can
 * access). A user is waiting on it, so it takes the gate's interactive floor.
 */
async function fetchCharacterSearch(
  characterId: number,
  accessToken: string,
  category: 'character' | 'structure',
  search: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const response = await esiPassThrough(
    '/characters/{character_id}/search/',
    { character_id: characterId, categories: category, search, strict: 'false' },
    esiAuthInit(accessToken, { signal }),
    { interactive: true },
  );
  if (!response.ok) throw new EsiCharacterSearchError(category, response.status);
  const parsed = esiSearchBodySchema.safeParse(await response.json());
  if (!parsed.success) throw new Error(`ESI ${category} search returned an invalid body`);
  return parsed.data[category] ?? [];
}

/** The user's linked characters whose grant still holds every scope in `scopes`. */
export async function scopedLinkedCharacters(
  userId: string,
  scopes: readonly EveScope[],
): Promise<LinkedCharacter[]> {
  const linked = await listLinkedCharacters(userId);
  return linked.filter((character) => !deriveScopeHealth(character, scopes).needsReconnect);
}

export interface CharacterSearchHit {
  accessToken: string;
  ids: number[];
}

/** One character's search with a freshly vended token, or null when no token vends. */
export async function searchAsCharacter(
  character: LinkedCharacter,
  category: 'character' | 'structure',
  search: string,
  signal?: AbortSignal,
): Promise<CharacterSearchHit | null> {
  signal?.throwIfAborted();
  const token = await getFreshAccessTokenForCharacter(character.characterId);
  if (token.kind !== 'ok') return null;
  signal?.throwIfAborted();
  return {
    accessToken: token.accessToken,
    ids: await fetchCharacterSearch(character.characterId, token.accessToken, category, search, signal),
  };
}

/**
 * The first character whose search succeeds, and the characters after it. A
 * character with no usable token, or whose search ESI refuses with 401 or 403,
 * is skipped; any other failure ends the search.
 */
export async function firstScopedSearch(
  characters: readonly LinkedCharacter[],
  category: 'character' | 'structure',
  search: string,
  signal?: AbortSignal,
): Promise<{ first: CharacterSearchHit; remaining: readonly LinkedCharacter[] }> {
  for (const [index, character] of characters.entries()) {
    try {
      const hit = await searchAsCharacter(character, category, search, signal);
      if (hit !== null) return { first: hit, remaining: characters.slice(index + 1) };
    } catch (error) {
      if (!isRefusedSearch(error)) throw error;
    }
  }
  throw new Error('No scoped linked character has a usable ESI access token');
}
