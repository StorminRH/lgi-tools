import type { EnumeratedOwner, OwnerSyncDescriptor, PersistVerdict } from './types';

export interface CorpSyncBase {
  now(): Date;
  listMembers(userId: string): Promise<EnumeratedOwner[]>;
  vendToken(characterId: number): Promise<string | null>;
  readRoles(characterId: number, accessToken: string): Promise<string[] | null>;
}

export interface CorpDatasetSpec<
  TOwner extends { corporationId: number },
  TState extends { lastRefreshedAt: Date | null },
  TSave,
> {

  ownerOf(userId: string, corporationId: number): TOwner;

  eligible(owner: EnumeratedOwner): boolean;

  requiredRoles: readonly string[];
  isStale(lastRefreshedAt: Date | null, now: Date): boolean;

  precondition?(owner: TOwner): Promise<boolean>;
  readState(owner: TOwner): Promise<TState | null>;

  fetchAndPlan(
    owner: TOwner,
    accessToken: string,
    state: TState | null,
  ): Promise<PersistVerdict<TSave>>;
  save(owner: TOwner, payload: TSave): Promise<void>;
  stampFresh(owner: TOwner): Promise<void>;

  saveGateState?(owner: TOwner): Promise<void>;
}

export function makeCorpDescriptor<
  TOwner extends { corporationId: number },
  TState extends { lastRefreshedAt: Date | null },
  TSave,
>(base: CorpSyncBase, spec: CorpDatasetSpec<TOwner, TState, TSave>): OwnerSyncDescriptor<TOwner, TState, TSave> {
  const { precondition, saveGateState } = spec;
  return {
    now: () => base.now(),
    enumerate: (userId) => base.listMembers(userId),
    identityOf: (owner) => ({ ownerType: 'corporation', ownerId: owner.corporationId }),
    vendToken: (characterId) => base.vendToken(characterId),
    ...(precondition === undefined ? {} : { precondition: (owner: TOwner) => precondition(owner) }),
    isStale: (state, now) => spec.isStale(state?.lastRefreshedAt ?? null, now),
    corpAxis: {
      eligible: (owner) => spec.eligible(owner),
      ownerOf: (userId, corporationId) => spec.ownerOf(userId, corporationId),
      requiredRoles: spec.requiredRoles,
      readRoles: (characterId, accessToken) => base.readRoles(characterId, accessToken),
    },
    readState: (owner) => spec.readState(owner),
    fetchAndPlan: (owner, accessToken, state) => spec.fetchAndPlan(owner, accessToken, state),
    save: (owner, payload) => spec.save(owner, payload),
    stampFresh: (owner) => spec.stampFresh(owner),
    ...(saveGateState === undefined ? {} : { saveGateState: (owner: TOwner) => saveGateState(owner) }),
  };
}
