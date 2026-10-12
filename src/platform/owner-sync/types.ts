import type { EsiOwnerType } from './owner-type';

export interface EnumeratedOwner {
  characterId: number;
  corporationId: number | null;
  hasRefreshToken: boolean;
  missingScopes: string[];
}

export type CharacterOwner = Omit<EnumeratedOwner, 'corporationId'>;

/**
 * Why a character has no access token: its grant is `lost` (revoked, an
 * invalid grant CCP confirmed, no linked token) until the user relinks, or
 * the token service is `unavailable` for now and the next view retries.
 */
export interface NoToken {
  readonly missing: 'lost' | 'unavailable';
}

/** One character's vend: the access token, or why there is none. */
export type VendedToken = string | NoToken;

export const hasToken = (vended: VendedToken): vended is string => typeof vended === 'string';

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
  | OwnerReadError;

/** A read ESI answered with an error status, with the answer's Expires when it sent one. */
export interface OwnerReadError {
  kind: 'error';
  code: string;
  expiresAt?: number;
}

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
  | { kind: 'needs_role'; expiresAt?: number }
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
  vendToken(characterId: number): Promise<VendedToken>;
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
  /**
   * Records a settled refusal (no credential holds the role, or the
   * character's grant is lost) as the answer for the owner's expired keys:
   * no ETag, expiring at `expiresAt` (the refusal's own Expires) or else at
   * each route's spec cache time. Until then the owner is not due, so views
   * stop re-asking and stop saying `refreshing`. A corporation's answer is
   * shared while its roster is the syncing user's own characters, so its
   * refusal belongs to that user alone (`recordRefusalFor` in the store).
   */
  recordRefusal?(owner: TOwner, expiresAt: number | null): Promise<void>;
}
