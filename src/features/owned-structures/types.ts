// Shared types for the corp owned-structures Neon slice (3.7.9). Kept I/O-free so
// the refresh orchestration (refresh.ts) can depend on the port abstraction WITHOUT
// importing the DB layer (queries.ts) or the auth slice — which it may not
// (feature→feature is boundary-banned). The non-zone wrapper
// (src/composition/sync/corp-structures-sync.ts) builds the real port; the orchestration is
// unit-tested against a fake one. Mirrors the owned-assets types, corp-only +
// keyed by corporation alone (the shared-per-corp divergence).
import type { SecurityClass } from '@/data/eve-data/security';
import type { ParsedCorpStructure } from './esi-projection';

/**
 * The read/display shape of one stored structure — what the read seam returns and
 * the planner's location selector renders (and feeds to computeStructureBonus next
 * session: typeId + securityClass are its inputs). `name` is null only for the rare
 * structure ESI returned without one; the selector falls back to the type name.
 */
export interface CorpStructureRow {
  structureId: number;
  typeId: number;
  systemId: number;
  securityClass: SecurityClass;
  name: string | null;
}

/**
 * Per-corp sharing consent state (the app-authored system-of-record). `enabled`
 * defaults false; `setBy`/`setAt` are audit fields the structures page can surface.
 */
export interface CorpStructureSharingState {
  enabled: boolean;
  setBy: number | null;
  setAt: Date;
}

/**
 * One stored structure joined with its authored completion — the shape the structures
 * page + corp completion editor consume (the rigs are empty and the tax null until a
 * Station_Manager records them; a null tax means the fee path assumes the 0.25% NPC
 * baseline).
 */
export interface CorpStructurePageStructure extends CorpStructureRow {
  rigTypeIds: number[];
  taxPct: number | null;
}

/**
 * One member corp as the structures page renders it: the corp + its resolved name +
 * the viewer's Station_Manager flag + the sharing state + the shared structures
 * (populated only when sharing is on). Defined here in the slice so both the
 * composition layer (which builds it) and the client section (which renders it) share
 * one shape without the component reaching into src/db.
 */
export interface CorpStructurePageView {
  corporationId: number;
  corporationName: string;
  isStationManager: boolean;
  sharingEnabled: boolean;
  structures: CorpStructurePageStructure[];
  lastRefreshedAt: number | null;
}

/**
 * The owner key: a corporation alone. NO userId — the structures catalogue is shared
 * across every member of the corp, so one row set is keyed by the corp id and all
 * members read it. (Contrast corp jobs, whose owner is (userId, corporationId).)
 */
export interface CorpOwner {
  corporationId: number;
}

/**
 * A linked character as the corp refresh enumerates it: identity, its cached corp id
 * (from the affiliation cache — null until first refreshed), plus the scope health
 * the eligibility predicate (canSyncCorpStructures) reads. The corp axis lives here
 * so the refresh can group members by corp.
 */
export interface RefreshCorpMember {
  characterId: number;
  corporationId: number | null;
  hasRefreshToken: boolean;
  missingScopes: string[];
}

/**
 * Per-corp sync state: the shared staleness stamp + the per-page etags to replay so
 * an unchanged corp returns a 304.
 */
export interface CorpStructuresSyncState {
  lastRefreshedAt: Date | null;
  pageEtags: string[];
}

/**
 * The slice's own read result, decoupled from lib/esi's EsiPagedRead (the Neon
 * path's fixed TTL ignores the ESI cache window the gate returns).
 */
export type CorpStructuresReadResult =
  | { kind: 'fresh'; items: unknown[]; etags: string[] }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

/**
 * The injected I/O the corp refresh runs over: auth (member enumeration, token vend,
 * in-game roles read), the one paged authed ESI gate read per corp, and Neon storage.
 * The real implementations are wired in src/composition/sync/corp-structures-sync.ts.
 */
export interface CorpStructuresPort {
  now(): Date;
  // Whether the corp has opted in to sharing its structures (the consent gate). Read
  // FIRST by the engine's precondition, before any staleness check or token vend, so a
  // non-opted-in corp dispatches zero ESI and stores zero rows. Default OFF.
  isSharingEnabled(corporationId: number): Promise<boolean>;
  // The user's linked characters with corp id + scope health.
  listMembers(userId: string): Promise<RefreshCorpMember[]>;
  // A fresh access token for a member character, or null when unavailable.
  vendToken(characterId: number): Promise<string | null>;
  // The character's in-game corp roles (fresh, no etag), or null on an ESI error.
  readRoles(characterId: number, accessToken: string): Promise<string[] | null>;
  // The paged authed conditional read of a corp's owned structures through the gate.
  readStructures(
    corporationId: number,
    accessToken: string,
    heldEtags: string[],
  ): Promise<CorpStructuresReadResult>;
  // Live (uncached) per-corp sync state, or null if never synced.
  readSyncState(corporationId: number): Promise<CorpStructuresSyncState | null>;
  // Replace the corp's stored structures with a fresh set + new etags, stamp freshness.
  saveStructures(corporationId: number, rows: ParsedCorpStructure[], etags: string[]): Promise<void>;
  // Stamp freshness only (the 304 path), leaving stored rows + etags as-is.
  stampFresh(corporationId: number): Promise<void>;
}
