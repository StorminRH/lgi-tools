import type { EsiOwnerType } from './owner-type';

export interface EnumeratedOwner {
  characterId: number;
  corporationId: number | null;
  hasRefreshToken: boolean;
  missingScopes: string[];
}

export type CharacterOwner = Omit<EnumeratedOwner, 'corporationId'>;

export interface OwnerKey {
  ownerType: EsiOwnerType;
  ownerId: number;
}

export interface PagedOwnerSyncState {
  lastRefreshedAt: Date | null;
}

/** One authed single-endpoint ESI read as a feature port sees it. */
export type SingleOwnerRead =
  | { kind: 'fresh'; body: unknown; etag: string | null }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

/**
 * The ESI reads of one try at one owner. What they learned about expiry
 * and ETags is committed only once the owner's write has stood; a try
 * that ends any other way drops it, and the next view reads again.
 */
export interface ReadSession {
  commit(): Promise<void>;
}

export type PersistVerdict<TSave> =
  | ({ kind: 'save' } & TSave)
  | { kind: 'stamp' }
  | { kind: 'needs_role' }
  | { kind: 'skip'; code?: string };

export type OwnerSyncResult =
  | { kind: 'succeeded'; target: OwnerKey }
  | {
      kind: 'deferred_for_budget';
      target: OwnerKey;
      error: import('../esi').EsiBudgetExhaustedError;
    }
  | { kind: 'failed_retryable'; target: OwnerKey; code: string }
  | { kind: 'failed_permanent'; target: OwnerKey; code: string };

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

export interface OwnerSyncDescriptor<TOwner, TState, TSave, TSession extends ReadSession = ReadSession> {
  now(): Date;
  enumerate(userId: string): Promise<EnumeratedOwner[]>;
  identityOf(owner: TOwner): OwnerKey;
  precondition?(owner: TOwner): Promise<boolean>;
  vendToken(characterId: number): Promise<string | null>;
  /** Whether any of the owner's stored ESI answers has expired; an owner that is not due costs no vend and no read. */
  isDue(owner: TOwner): Promise<boolean>;
  openSession(): TSession;
  characterAxis?: OwnerAxis<TOwner>;
  corpAxis?: CorpOwnerAxis<TOwner>;
  readState(owner: TOwner): Promise<TState | null>;
  fetchAndPlan(owner: TOwner, accessToken: string, state: TState | null, session: TSession): Promise<PersistVerdict<TSave>>;
  save(owner: TOwner, payload: TSave): Promise<void>;
  stampFresh(owner: TOwner): Promise<void>;
  saveGateState?(owner: TOwner): Promise<void>;
}
