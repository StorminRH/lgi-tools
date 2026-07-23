// The paged-owned dataset descriptor builder (Family-2 generalization). The owned
// blueprints + assets slices are structural twins: both enumerate a user's characters
// and member corps, page an authed ESI read, replace-all per owner, and share the
// paged sync-state shape. This factors the identical OwnerSyncDescriptor scaffold into
// one builder; each slice supplies its port + the handful of genuinely per-dataset
// knobs (staleness, eligibility, the Director role, the resource path segment, and the
// projection parse). It lives in src/lib beside the engine, so a slice's refresh.ts
// stays boundary-legal (feature → lib) and its fake-port tests pass unchanged.
import { planRead } from './plan';
import type { EnumeratedOwner, OwnerKey, OwnerSyncDescriptor, PagedOwnerSyncState } from './types';
import type { EsiResponseHeaders } from '../esi/response-metadata';

/**
 * The slice's own paged read result, decoupled from lib/esi's EsiPagedRead (the Neon
 * path's fixed TTL ignores the ESI cache window the gate returns). The db wiring's
 * AuthedPagedRead is structurally this — assigned through the port.
 */
export type PagedOwnerReadResult =
  | { kind: 'fresh'; items: unknown[]; etags: string[]; responseHeaders: EsiResponseHeaders }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

/**
 * The injected I/O a paged-owned refresh runs over: auth (token vend, role read,
 * character enumeration), the ESI gate read, and Neon storage. The real port is wired
 * in src/db/owned-*-sync.ts; the orchestration is unit-tested against a fake one. TRow
 * is the slice's projected row (OwnedAsset / OwnedBlueprint).
 */
export interface OwnedDatasetPort<TRow> {
  now(): Date;
  // The user's linked characters with scope health + cached corp id.
  listCharacters(userId: string): Promise<EnumeratedOwner[]>;
  // A fresh access token for a character, or null when unavailable / reauth-needed.
  vendToken(characterId: number): Promise<string | null>;
  // A character's in-game corp roles (for the Director gate), or null on failure.
  readRoles(characterId: number, accessToken: string): Promise<string[] | null>;
  // Paginated authed read through the ESI gate.
  read(basePath: string, accessToken: string, heldEtags: string[]): Promise<PagedOwnerReadResult>;
  // Live (uncached) per-owner sync state, or null if never synced.
  readSyncState(owner: OwnerKey): Promise<PagedOwnerSyncState | null>;
  // Replace the owner's stored rows with a fresh set + new etags, stamp freshness.
  save(
    owner: OwnerKey,
    rows: TRow[],
    etags: string[],
    source: { endpoint: string; items: unknown[]; responseHeaders: EsiResponseHeaders },
  ): Promise<void>;
  // Stamp freshness only (the 304 path), leaving stored rows + etags as-is.
  stampFresh(owner: OwnerKey): Promise<void>;
}

/** The per-dataset knobs — everything that genuinely differs between the twins. */
export interface OwnedDatasetSpec<TRow> {
  // The ESI path segment: 'assets' | 'blueprints'.
  resource: string;
  // The staleness gate, closing over the slice's TTL.
  isStale(lastRefreshedAt: Date | null, now: Date): boolean;
  // Whether a character may sync this dataset for itself (token + scopes).
  eligibleCharacter(owner: EnumeratedOwner): boolean;
  // Whether a character may contribute to its corp's sync (token + scopes).
  eligibleCorp(owner: EnumeratedOwner): boolean;
  // The in-game roles a Director must hold for the corp endpoint.
  requiredRoles: readonly string[];
  // Project the fresh ESI body to storable rows, or null on a boundary reject.
  parse(items: unknown[]): TRow[] | null;
}

// The save payload the engine carries from fetchAndPlan to save (per-owner replace-all).
interface OwnedSave<TRow> {
  rows: TRow[];
  etags: string[];
  source: { endpoint: string; items: unknown[]; responseHeaders: EsiResponseHeaders };
}

// Both owner types share the identical row shape + cache; only the path differs.
function basePathFor(resource: string, owner: OwnerKey): string {
  return owner.ownerType === 'character'
    ? `/characters/${owner.ownerId}/${resource}/`
    : `/corporations/${owner.ownerId}/${resource}/`;
}

/**
 * Builds the shared owned-data refresh descriptor from dataset-specific read and persist ports
 * without exposing pipeline sequencing to the caller.
 */
export function makeOwnedDescriptor<TRow>(
  port: OwnedDatasetPort<TRow>,
  spec: OwnedDatasetSpec<TRow>,
): OwnerSyncDescriptor<OwnerKey, PagedOwnerSyncState, OwnedSave<TRow>> {
  return {
    now: () => port.now(),
    enumerate: (userId) => port.listCharacters(userId),
    identityOf: (owner) => owner,
    vendToken: (characterId) => port.vendToken(characterId),
    isStale: (state, now) => spec.isStale(state?.lastRefreshedAt ?? null, now),
    characterAxis: {
      eligible: (owner) => spec.eligibleCharacter(owner),
      ownerOf: (characterId) => ({ ownerType: 'character', ownerId: characterId }),
    },
    corpAxis: {
      eligible: (owner) => spec.eligibleCorp(owner),
      ownerOf: (_userId, corporationId) => ({ ownerType: 'corporation', ownerId: corporationId }),
      requiredRoles: spec.requiredRoles,
      readRoles: (characterId, accessToken) => port.readRoles(characterId, accessToken),
    },
    readState: (owner) => port.readSyncState(owner),
    fetchAndPlan: async (owner, accessToken, state) => {
      const read = await port.read(basePathFor(spec.resource, owner), accessToken, state?.pageEtags ?? []);
      return planRead(read, (fresh) => {
        const rows = spec.parse(fresh.items);
        return rows === null
          ? null
          : {
              rows,
              etags: fresh.etags,
              source: {
                endpoint: basePathFor(spec.resource, owner),
                items: fresh.items,
                responseHeaders: fresh.responseHeaders,
              },
            };
      });
    },
    save: (owner, payload) => port.save(owner, payload.rows, payload.etags, payload.source),
    stampFresh: (owner) => port.stampFresh(owner),
  };
}
