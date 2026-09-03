export interface EnumeratedOwner {
  characterId: number;
  corporationId: number | null;
  hasRefreshToken: boolean;
  missingScopes: string[];
}

export interface OwnerKey {
  ownerType: 'character' | 'corporation';
  ownerId: number;
}

export interface PagedOwnerSyncState {
  lastRefreshedAt: Date | null;
  pageEtags: string[];
}

export interface CorpMemberCandidate {
  vendingCharacterId: number;
  accessToken: string;
  hasRole: boolean;
}

export type CorpDirectorResolution =
  | { kind: 'token'; vendingCharacterId: number; accessToken: string }
  | { kind: 'needs_role' }
  | { kind: 'unavailable' };

export type PersistVerdict<TSave> =
  | ({ kind: 'save' } & TSave)
  | { kind: 'stamp' }
  | { kind: 'needs_role' }
  | { kind: 'skip'; code?: string };

export interface OwnerSyncTarget {
  ownerType: 'character' | 'corporation';
  ownerId: number;
}

export type OwnerSyncResult =
  | { kind: 'succeeded'; target: OwnerSyncTarget }
  | {
      kind: 'deferred_for_budget';
      target: OwnerSyncTarget;
      error: import('../esi').EsiBudgetExhaustedError;
    }
  | { kind: 'failed_retryable'; target: OwnerSyncTarget; code: string }
  | { kind: 'failed_permanent'; target: OwnerSyncTarget; code: string };

export interface OwnerSyncRunOptions {
  target?: OwnerSyncTarget;
  onBudgetDeferred?(
    target: OwnerSyncTarget,
    error: import('../esi').EsiBudgetExhaustedError,
  ): Promise<void>;
}

export interface OwnerAxis<TOwner> {

  eligible(owner: EnumeratedOwner): boolean;

  ownerOf(characterId: number): TOwner;
}

export interface CorpOwnerAxis<TOwner> {

  eligible(owner: EnumeratedOwner): boolean;

  ownerOf(userId: string, corporationId: number): TOwner;

  requiredRoles: readonly string[];

  readRoles(characterId: number, accessToken: string): Promise<string[] | null>;
}

export interface OwnerSyncDescriptor<TOwner, TState, TSave> {

  now(): Date;

  enumerate(userId: string): Promise<EnumeratedOwner[]>;

  identityOf(owner: TOwner): OwnerSyncTarget;

  precondition?(owner: TOwner): Promise<boolean>;

  vendToken(characterId: number): Promise<string | null>;

  isStale(state: TState | null, now: Date): boolean;
  characterAxis?: OwnerAxis<TOwner>;
  corpAxis?: CorpOwnerAxis<TOwner>;

  readState(owner: TOwner): Promise<TState | null>;

  fetchAndPlan(owner: TOwner, accessToken: string, state: TState | null): Promise<PersistVerdict<TSave>>;

  save(owner: TOwner, payload: TSave): Promise<void>;

  stampFresh(owner: TOwner): Promise<void>;

  saveGateState?(owner: TOwner): Promise<void>;
}
