import type { CharacterOwner, EnumeratedOwner, OwnerSyncDescriptor, PersistVerdict, ReadSession, VendedToken } from './types';

export interface CharacterSyncBase<TState, TSession extends ReadSession> {
  now(): Date;
  listCharacters(userId: string): Promise<CharacterOwner[]>;
  vendToken(characterId: number): Promise<VendedToken>;
  isDue(characterId: number): Promise<boolean>;
  openSession(): TSession;
  readSyncState(characterId: number): Promise<TState | null>;
  stampFresh(characterId: number): Promise<void>;
  /** Records a settled refusal as the character's stored answer; a dataset with no stored answer of its own leaves it out. */
  recordRefusal?(characterId: number, expiresAt: number | null): Promise<void>;
}

export interface CharacterDatasetSpec<TState, TSave, TSession extends ReadSession> {
  eligible(owner: EnumeratedOwner): boolean;
  fetchAndPlan(
    characterId: number,
    accessToken: string,
    state: TState | null,
    session: TSession,
  ): Promise<PersistVerdict<TSave>>;
  save(characterId: number, payload: TSave): Promise<void>;
}

export function makeCharacterDescriptor<TState, TSave, TSession extends ReadSession>(
  base: CharacterSyncBase<TState, TSession>,
  spec: CharacterDatasetSpec<TState, TSave, TSession>,
): OwnerSyncDescriptor<number, TState, TSave, TSession> {
  const { recordRefusal } = base;
  return {
    now: () => base.now(),
    enumerate: async (userId) =>
      (await base.listCharacters(userId)).map((character) => ({ ...character, corporationId: null })),
    identityOf: (characterId) => ({ ownerType: 'character', ownerId: characterId }),
    vendToken: (characterId) => base.vendToken(characterId),
    isDue: (characterId) => base.isDue(characterId),
    openSession: () => base.openSession(),
    characterAxis: {
      eligible: (owner) => spec.eligible(owner),
      ownerOf: (characterId) => characterId,
    },
    readState: (characterId) => base.readSyncState(characterId),
    fetchAndPlan: (characterId, accessToken, state, session) => spec.fetchAndPlan(characterId, accessToken, state, session),
    save: (characterId, payload) => spec.save(characterId, payload),
    stampFresh: (characterId) => base.stampFresh(characterId),
    ...(recordRefusal === undefined
      ? {}
      : { recordRefusal: (characterId: number, expiresAt: number | null) => recordRefusal(characterId, expiresAt) }),
  };
}
