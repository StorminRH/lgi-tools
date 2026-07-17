// Generic per-owner sync engine — shared types (MIGRATE.D.2).
//
// The engine (engine.ts) owns the MECHANICAL dance every per-owner ESI→Neon slice
// clones (owned blueprints / assets, skills, char + corp industry jobs): enumerate
// → stale-gate-before-vend → token / Director resolution → conditional fetch + plan
// → write-behind dispatch. Each slice supplies an OwnerSyncDescriptor (its port
// wiring + per-feature projection / eligibility / TTL); the engine knows nothing
// about any feature. It lives in src/lib so the boundary rules (lib → lib only)
// STRUCTURALLY forbid an engine → feature import.

/**
 * A linked character as a refresh enumerates it — identity, cached corp id, and the
 * scope health the slice's eligibility predicate reads. corporationId is null for a
 * character with no cached affiliation (and is unused by character-only slices).
 */
export interface EnumeratedOwner {
  characterId: number;
  corporationId: number | null;
  hasRefreshToken: boolean;
  missingScopes: string[];
}

/**
 * A paged-owner key: a character or a corporation, by id. The shared owner shape the
 * paged owned-* slices (blueprints, assets) key their per-owner rows on — and the
 * owners the read side (resolveOwnedOwnersForUser) enumerates. Each slice keeps its
 * OWN Postgres enum (the one-source-of-truth rule) but the enum's TS type is this same
 * literal union, so the descriptor + port speak one type and the duplicate defs die.
 */
export interface OwnerKey {
  ownerType: 'character' | 'corporation';
  ownerId: number;
}

/**
 * The per-owner sync state the PAGED owned-* twins persist: the staleness stamp + the
 * per-page etags replayed so an unchanged owner returns a 304. Named for the paged
 * shape — distinct from a slice's own TState (jobs' single etag, skills' two).
 */
export interface PagedOwnerSyncState {
  lastRefreshedAt: Date | null;
  pageEtags: string[];
}

/**
 * One vended member candidate for a corporation: the character whose token would
 * read the corp endpoint, that already-vended token, and whether it holds a
 * required in-game role.
 */
export interface CorpMemberCandidate {
  vendingCharacterId: number;
  accessToken: string;
  hasRole: boolean;
}

/**
 * The Director-resolution outcome for one corporation:
 *   token       — a role-holder's token to read the corp endpoint with;
 *   needs_role  — members vended but NONE holds the role (a graceful per-corp state
 *                 a slice may record via saveGateState; granting scope can't fix it);
 *   unavailable — no member could be vended this run (transient — skip and retry).
 */
export type CorpDirectorResolution =
  | { kind: 'token'; vendingCharacterId: number; accessToken: string }
  | { kind: 'needs_role' }
  | { kind: 'unavailable' };

/**
 * What a per-owner refresh should persist after the fetch + plan. The 'save' variant
 * carries the slice's own save shape (TSave) inline, so a slice's planRead call or
 * bespoke planner (such as planSkillsPersist) is already a PersistVerdict — no
 * adapter. 'needs_role' records a graceful gate state via
 * saveGateState (a no-op for slices that don't define one — i.e. it degrades to skip).
 */
export type PersistVerdict<TSave> =
  | ({ kind: 'save' } & TSave)
  | { kind: 'stamp' }
  | { kind: 'needs_role' }
  | { kind: 'skip'; code?: string };

/** Validated owner and authenticated-reader identity passed into one owner-sync run. */
export interface OwnerSyncTarget {
  ownerType: 'character' | 'corporation';
  ownerId: number;
}

/**
 * Closed owner-sync outcome preserving fresh, refreshed, deferred, skipped, and failed states for
 * callers and telemetry.
 */
export type OwnerSyncResult =
  | { kind: 'succeeded'; target: OwnerSyncTarget }
  | {
      kind: 'deferred_for_budget';
      target: OwnerSyncTarget;
      error: import('../esi').EsiBudgetExhaustedError;
    }
  | { kind: 'failed_retryable'; target: OwnerSyncTarget; code: string }
  | { kind: 'failed_permanent'; target: OwnerSyncTarget; code: string };

/**
 * Per-run owner-sync controls for clock, forcing, queue behavior, and optional injected ports used
 * by tests.
 */
export interface OwnerSyncRunOptions {
  target?: OwnerSyncTarget;
  onBudgetDeferred?(
    target: OwnerSyncTarget,
    error: import('../esi').EsiBudgetExhaustedError,
  ): Promise<void>;
}

/** The character-owner axis (absent for corp-only slices like corp jobs). */
export interface OwnerAxis<TOwner> {
  // Whether a character is eligible to sync this dataset (refresh token + scopes).
  eligible(owner: EnumeratedOwner): boolean;
  // The owner key for a character (e.g. {ownerType:'character', ownerId} or the id).
  ownerOf(characterId: number): TOwner;
}

/** The corporation-owner axis (absent for character-only slices like skills / jobs). */
export interface CorpOwnerAxis<TOwner> {
  // Whether a character is eligible to contribute to its corp's sync (token+scopes).
  eligible(owner: EnumeratedOwner): boolean;
  // The owner key for a corporation (shared {corporation, id} or private (user, corp)).
  ownerOf(userId: string, corporationId: number): TOwner;
  // The in-game roles a Director must hold for the corp endpoint.
  requiredRoles: readonly string[];
  // A character's in-game corp roles (for the Director gate), or null on failure.
  readRoles(characterId: number, accessToken: string): Promise<string[] | null>;
}

/**
 * The per-feature seam the engine runs over. The slice builds it inside its
 * refreshXForUser(port, userId) from the injected port + its own pure helpers, so
 * refresh.ts stays boundary-legal (feature → lib + same-slice) and its existing
 * tests pass unchanged.
 */
export interface OwnerSyncDescriptor<TOwner, TState, TSave> {
  // The clock (injected for testability — the wrapper supplies () => new Date()).
  now(): Date;
  // The user's linked characters (the slice's port.listCharacters / listMembers).
  enumerate(userId: string): Promise<EnumeratedOwner[]>;
  // Stable owner identity used by targeted deferred-job retries.
  identityOf(owner: TOwner): OwnerSyncTarget;
  // An optional per-owner gate read FIRST in syncOwner — before readState, the
  // staleness check, and any token vend. Returns false ⇒ the owner is skipped
  // entirely: no state read, no vend / roles read, no fetch, no save. Absent ⇒ the
  // owner always proceeds (every existing slice omits it — byte-identical). Corp
  // structures supply it to gate the pull on per-corp sharing consent, so a
  // non-opted-in corp dispatches zero ESI and stores zero rows.
  precondition?(owner: TOwner): Promise<boolean>;
  // A fresh access token for a character, or null when unavailable / reauth-needed.
  vendToken(characterId: number): Promise<string | null>;
  // The staleness gate (the slice's isXStale, closing over its TTL), read BEFORE any
  // vend so a fresh owner does zero work — no vend, no roles read, no fetch.
  isStale(state: TState | null, now: Date): boolean;
  characterAxis?: OwnerAxis<TOwner>;
  corpAxis?: CorpOwnerAxis<TOwner>;
  // Live (uncached) per-owner sync state — the staleness stamp + held etag(s).
  readState(owner: TOwner): Promise<TState | null>;
  // Conditional fetch + per-feature plan → a persist verdict. Single / paged / dual
  // endpoint and the projection all live here (the slice's plan fn or planRead).
  fetchAndPlan(owner: TOwner, accessToken: string, state: TState | null): Promise<PersistVerdict<TSave>>;
  // Write-behind: persist the projected payload + new etag(s), stamp, revalidate.
  save(owner: TOwner, payload: TSave): Promise<void>;
  // The 304 path: bump freshness only, stored rows + held etag(s) untouched.
  stampFresh(owner: TOwner): Promise<void>;
  // Record a graceful gate state (corp jobs: drop the board + write 'needs_role').
  // Absent ⇒ a needs_role outcome is simply a skip (owned blueprints / assets).
  saveGateState?(owner: TOwner): Promise<void>;
}
