import type { EnumeratedOwner, OwnerSyncDescriptor, PersistVerdict } from './types';

export interface CharacterSyncBase<TState> {
  now(): Date;

  listCharacters(userId: string): Promise<Array<Omit<EnumeratedOwner, 'corporationId'>>>;
  vendToken(characterId: number): Promise<string | null>;
  readSyncState(characterId: number): Promise<TState | null>;
  stampFresh(characterId: number): Promise<void>;
}

export interface CharacterDatasetSpec<TState, TSave> {

  isStale(lastRefreshedAt: Date | null, now: Date): boolean;

  eligible(owner: EnumeratedOwner): boolean;

  fetchAndPlan(
    characterId: number,
    accessToken: string,
    state: TState | null,
  ): Promise<PersistVerdict<TSave>>;

  save(characterId: number, payload: TSave): Promise<void>;
}

export function makeCharacterDescriptor<TState extends { lastRefreshedAt: Date | null }, TSave>(
  base: CharacterSyncBase<TState>,
  spec: CharacterDatasetSpec<TState, TSave>,
): OwnerSyncDescriptor<number, TState, TSave> {
  return {
    now: () => base.now(),

    enumerate: async (userId) =>
      (await base.listCharacters(userId)).map((character) => ({ ...character, corporationId: null })),
    identityOf: (characterId) => ({ ownerType: 'character', ownerId: characterId }),
    vendToken: (characterId) => base.vendToken(characterId),
    isStale: (state, now) => spec.isStale(state?.lastRefreshedAt ?? null, now),
    characterAxis: {
      eligible: (owner) => spec.eligible(owner),
      ownerOf: (characterId) => characterId,
    },
    readState: (characterId) => base.readSyncState(characterId),
    fetchAndPlan: (characterId, accessToken, state) => spec.fetchAndPlan(characterId, accessToken, state),
    save: (characterId, payload) => spec.save(characterId, payload),
    stampFresh: (characterId) => base.stampFresh(characterId),
  };
}
