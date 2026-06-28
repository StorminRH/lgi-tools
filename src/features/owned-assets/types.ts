// Shared types for the owned-assets Neon slice (3.7.7.1). Kept I/O-free so the
// refresh orchestration (refresh.ts) can depend on the port abstraction WITHOUT
// importing the DB layer (queries.ts) or the auth slice — which it may not
// (feature→feature is boundary-banned). The non-zone wrapper (src/db) builds the
// real port; the orchestration is unit-tested against a fake one. A direct mirror
// of the owned-blueprints types.
import type { OwnedAsset } from './esi-projection';
import type { OwnedAssetOwnerType } from './schema';

// An asset owner: a character or a corporation, by id.
export interface OwnerKey {
  ownerType: OwnedAssetOwnerType;
  ownerId: number;
}

// A linked character as the refresh enumerates it — identity, cached corp id, and
// the scope health the eligibility predicates read.
export interface RefreshCharacter {
  characterId: number;
  corporationId: number | null;
  hasRefreshToken: boolean;
  missingScopes: string[];
}

// Per-owner sync state: the staleness stamp + the per-page etags to replay so an
// unchanged owner returns a 304.
export interface OwnerSyncState {
  lastRefreshedAt: Date | null;
  pageEtags: string[];
}

// The slice's own read result, decoupled from lib/esi's EsiPagedRead (the Neon
// path's fixed TTL ignores the ESI cache window the gate returns).
export type OwnedAssetsReadResult =
  | { kind: 'fresh'; items: unknown[]; etags: string[] }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

// The injected I/O the refresh runs over: auth (token vend, role read, character
// enumeration), the ESI gate read, and Neon storage. The real implementations are
// wired in src/db/owned-assets-sync.ts.
export interface OwnedAssetsPort {
  now(): Date;
  // The user's linked characters with scope health + cached corp id.
  listCharacters(userId: string): Promise<RefreshCharacter[]>;
  // A fresh access token for a character, or null when unavailable / reauth-needed.
  vendToken(characterId: number): Promise<string | null>;
  // A character's in-game corp roles (for the Director gate), or null on failure.
  readRoles(characterId: number, accessToken: string): Promise<string[] | null>;
  // Paginated authed assets read through the ESI gate.
  readAssets(
    basePath: string,
    accessToken: string,
    heldEtags: string[],
  ): Promise<OwnedAssetsReadResult>;
  // Live (uncached) per-owner sync state, or null if never synced.
  readSyncState(owner: OwnerKey): Promise<OwnerSyncState | null>;
  // Replace the owner's stored rows with a fresh set + new etags, stamp freshness.
  saveAssets(owner: OwnerKey, rows: OwnedAsset[], etags: string[]): Promise<void>;
  // Stamp freshness only (the 304 path), leaving stored rows + etags as-is.
  stampFresh(owner: OwnerKey): Promise<void>;
}
