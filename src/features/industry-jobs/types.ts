// Shared types for the personal industry-jobs Neon slice (MIGRATE.B.2). Kept I/O-free
// so the refresh orchestration (refresh.ts) can depend on the port abstraction WITHOUT
// importing the DB layer (queries.ts) or the auth slice — which it may not
// (feature→feature is boundary-banned). The non-zone wrapper
// (src/db/industry-jobs-sync.ts) builds the real port; the orchestration is
// unit-tested against a fake one. Mirrors the skill-queue slice, simplified to ONE
// single-page endpoint (one held etag, no two-halves split).
import type { IndustryJob } from './esi-projection';

/**
 * The stored per-character payload — the active job board. The raw ESI status is
 * stored verbatim; the client derives "ready" from each job's absolute end_date (no
 * at-write derivation, no scheduler). The wire/consumer shape too (the API contract
 * references it).
 */
export interface CharacterJobsData {
  jobs: IndustryJob[];
}

/**
 * A linked character as the refresh enumerates it — identity plus the scope health
 * the eligibility predicate (canSyncIndustryJobs) reads. No corp id: personal jobs is
 * per-character only.
 */
export interface RefreshCharacter {
  characterId: number;
  hasRefreshToken: boolean;
  missingScopes: string[];
}

/**
 * Per-character sync state: the staleness stamp + the single held etag to replay so an
 * unchanged board returns a 304.
 */
export interface CharacterJobsSyncState {
  lastRefreshedAt: Date | null;
  jobsEtag: string | null;
}

/**
 * The slice's own read result for the one endpoint, decoupled from lib/esi's
 * EsiAuthedRead (the Neon path's fixed TTL ignores the ESI cache window the gate
 * returns). 'fresh' carries the raw body for the slice's projection to parse.
 */
export type JobsEsiRead =
  | { kind: 'fresh'; body: unknown; etag: string | null }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

/**
 * The injected I/O the refresh runs over: auth (character enumeration, token vend),
 * the one authed ESI gate read, and Neon storage. The real implementations are wired
 * in src/db/industry-jobs-sync.ts.
 */
export interface JobsPort {
  now(): Date;
  // The user's linked characters with scope health.
  listCharacters(userId: string): Promise<RefreshCharacter[]>;
  // A fresh access token for a character, or null when unavailable / reauth-needed.
  vendToken(characterId: number): Promise<string | null>;
  // The single-page authed conditional read through the ESI gate.
  readJobs(characterId: number, accessToken: string, heldEtag: string | null): Promise<JobsEsiRead>;
  // Live (uncached) per-character sync state, or null if never synced.
  readSyncState(characterId: number): Promise<CharacterJobsSyncState | null>;
  // Persist the fresh board + new etag, stamping freshness.
  saveJobs(characterId: number, jobs: IndustryJob[], etag: string | null): Promise<void>;
  // Stamp freshness only (the 304 path), leaving stored data + etag as-is.
  stampFresh(characterId: number): Promise<void>;
}

// ── CORP industry jobs (MIGRATE.B.3) — the corp twins of the shapes above ──

/**
 * A linked character as the CORP refresh enumerates it: identity, its cached corp id
 * (from the affiliation cache — null until first refreshed), plus the scope health the
 * eligibility predicate (canSyncCorpIndustryJobs) reads. The corp axis lives here
 * (unlike RefreshCharacter) so the refresh can group members by corp.
 */
export interface RefreshCorpMember {
  characterId: number;
  corporationId: number | null;
  hasRefreshToken: boolean;
  missingScopes: string[];
}

/**
 * Per-(user, corp) sync state: the staleness stamp, the single held etag, and the
 * graceful per-corp `syncError` (e.g. 'needs_role') the board surfaces.
 */
export interface CorpJobsSyncState {
  lastRefreshedAt: Date | null;
  jobsEtag: string | null;
  syncError: string | null;
}

/**
 * The injected I/O the corp refresh runs over: auth (member enumeration, token vend,
 * in-game roles read), the one authed ESI gate read per corp, and Neon storage. The
 * real implementations are wired in src/db/corp-industry-jobs-sync.ts. Reuses
 * JobsEsiRead (the corp board is the same single endpoint shape as the character one).
 */
export interface CorpJobsPort {
  now(): Date;
  // The user's linked characters with corp id + scope health.
  listMembers(userId: string): Promise<RefreshCorpMember[]>;
  // A fresh access token for a member character, or null when unavailable.
  vendToken(characterId: number): Promise<string | null>;
  // The character's in-game corp roles (fresh, no etag), or null on an ESI error.
  readRoles(characterId: number, accessToken: string): Promise<string[] | null>;
  // The single-page authed conditional read of a corp's job board through the gate.
  readJobs(corporationId: number, accessToken: string, heldEtag: string | null): Promise<JobsEsiRead>;
  // Live (uncached) per-(user, corp) sync state, or null if never synced.
  readSyncState(userId: string, corporationId: number): Promise<CorpJobsSyncState | null>;
  // Persist the fresh board + new etag, clearing any error and stamping freshness.
  saveJobs(userId: string, corporationId: number, jobs: IndustryJob[], etag: string | null): Promise<void>;
  // Record the graceful 'needs_role' state: drop the board, stamp freshness so a
  // re-view inside the window doesn't re-resolve roles.
  saveNeedsRole(userId: string, corporationId: number): Promise<void>;
  // Stamp freshness only (the 304 path), clearing any prior error.
  stampFresh(userId: string, corporationId: number): Promise<void>;
}
