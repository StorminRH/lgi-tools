import type { EnumeratedOwner, OwnerSyncDescriptor, ReadSession } from './types';

export interface CorpSyncBase<TSession extends ReadSession> {
  now(): Date;
  listMembers(userId: string): Promise<EnumeratedOwner[]>;
  vendToken(characterId: number): Promise<string | null>;
  readRoles(characterId: number, accessToken: string): Promise<string[] | null>;
  openSession(): TSession;
}

/** What a corp dataset adds to the shared corp base: who its owners are, which role reads them, and the descriptor's owner-side steps. */
export interface CorpDatasetSpec<
  TOwner extends { corporationId: number },
  TState extends { lastRefreshedAt: Date | null },
  TSave,
  TSession extends ReadSession,
> extends Pick<
  OwnerSyncDescriptor<TOwner, TState, TSave, TSession>,
  'isDue' | 'precondition' | 'readState' | 'fetchAndPlan' | 'save' | 'stampFresh' | 'saveGateState'
> {
  ownerOf(userId: string, corporationId: number): TOwner;
  eligible(owner: EnumeratedOwner): boolean;
  requiredRoles: readonly string[];
}

export function makeCorpDescriptor<
  TOwner extends { corporationId: number },
  TState extends { lastRefreshedAt: Date | null },
  TSave,
  TSession extends ReadSession,
>(
  base: CorpSyncBase<TSession>,
  spec: CorpDatasetSpec<TOwner, TState, TSave, TSession>,
): OwnerSyncDescriptor<TOwner, TState, TSave, TSession> {
  const { precondition, saveGateState } = spec;
  return {
    now: () => base.now(),
    enumerate: (userId) => base.listMembers(userId),
    identityOf: (owner) => ({ ownerType: 'corporation', ownerId: owner.corporationId }),
    vendToken: (characterId) => base.vendToken(characterId),
    ...(precondition === undefined ? {} : { precondition: (owner: TOwner) => precondition(owner) }),
    isDue: (owner) => spec.isDue(owner),
    openSession: () => base.openSession(),
    corpAxis: {
      eligible: (owner) => spec.eligible(owner),
      ownerOf: (userId, corporationId) => spec.ownerOf(userId, corporationId),
      requiredRoles: spec.requiredRoles,
      readRoles: (characterId, accessToken) => base.readRoles(characterId, accessToken),
    },
    readState: (owner) => spec.readState(owner),
    fetchAndPlan: (owner, accessToken, state, session) => spec.fetchAndPlan(owner, accessToken, state, session),
    save: (owner, payload) => spec.save(owner, payload),
    stampFresh: (owner) => spec.stampFresh(owner),
    ...(saveGateState === undefined ? {} : { saveGateState: (owner: TOwner) => saveGateState(owner) }),
  };
}
