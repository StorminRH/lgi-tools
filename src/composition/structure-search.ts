import { z } from 'zod';
import { EVE_CHARACTER_SEARCH_SCOPE, type EveScope } from '@/config/eve-scopes';
import type { StructureSearchResult } from '@/features/custom-structures/api-contract';
import { getOrInsertComputed } from '@/lib/array';
import { mapConcurrent } from '@/lib/fan-out';
import { esiPassThrough } from '@/data/esi-store';
import { STRUCTURE_LOOKUP_CONCURRENCY, STRUCTURE_LOOKUP_ROUTE } from '@/features/character-sheet/keys';
import { EsiBudgetExhaustedError } from '@/platform/esi';
import { esiAuthInit } from '@/platform/esi/request-init';
import {
  firstScopedSearch,
  scopedLinkedCharacters,
  searchAsCharacter,
  type CharacterSearchHit,
} from './esi-character-search';

const MAX_STRUCTURE_RESULTS = 8;
const STRUCTURE_SEARCH_SCOPES = [
  EVE_CHARACTER_SEARCH_SCOPE,
  'esi-universe.read_structures.v1',
] as const satisfies readonly EveScope[];

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
  const response = await esiPassThrough(STRUCTURE_LOOKUP_ROUTE, { structure_id: structureId }, esiAuthInit(accessToken, { signal }));
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
  const scoped = await scopedLinkedCharacters(userId, STRUCTURE_SEARCH_SCOPES);
  if (scoped.length === 0) return [];

  const { first, remaining } = await firstScopedSearch(scoped, 'structure', search, signal);
  const searched: CharacterSearchHit[] = [first];
  const outcomes = await Promise.allSettled(
    remaining.map((character) => searchAsCharacter(character, 'structure', search, signal)),
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
  for (const { accessToken, ids } of searched) {
    for (const id of ids) getOrInsertComputed(seenBy, id, () => []).push(accessToken);
  }
  const read = await mapConcurrent(
    [...seenBy].slice(0, MAX_STRUCTURE_RESULTS),
    STRUCTURE_LOOKUP_CONCURRENCY,
    ([id, accessTokens]) => readWithAny(id, accessTokens, signal),
  );
  return read.filter((structure): structure is StructureSearchResult => structure !== null);
}
