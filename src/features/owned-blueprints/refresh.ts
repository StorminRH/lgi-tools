// The on-view owned-blueprints refresh (MIGRATE.0; engine-backed since MIGRATE.D.2,
// descriptor via the shared builder since 3.7.30.1). PURE orchestration:
// refreshOwnedBlueprintsForUser builds a paged-owned OwnerSyncDescriptor from the
// injected port (types.ts) + this slice's per-dataset knobs and hands it to the shared
// per-owner sync engine (src/lib/owner-sync). It imports no auth and no DB, so it stays
// inside the feature boundary and is unit-tested with a fake port. The real port is
// wired in src/db/owned-blueprints-sync.ts.
//
// The engine checks the staleness gate BEFORE any token vend or ESI call (a fresh owner
// does zero work — for both owner types), runs the character pass then the corp pass in
// series, and resolves a corp Director among the member characters. Per-owner specifics
// stay here: the resource path segment, the eligibility scopes, the Director role, and
// the blueprint projection. refresh.test.ts pins the byte-identical behaviour.
import {
  makeOwnedDescriptor,
  runOwnerSync,
  type OwnerSyncResult,
  type OwnerSyncRunOptions,
} from '@/lib/owner-sync';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { CORP_BLUEPRINTS_REQUIRED_ROLES, canSyncCorpBlueprints } from './corp-sync-eligibility';
import { parseBlueprintsBody } from './esi-projection';
import { canSyncBlueprints } from './sync-eligibility';
import type { OwnedBlueprintsPort } from './types';

const BLUEPRINTS_FRESHNESS = freshnessGate('owned_blueprints');

/**
 * Refreshes every eligible personal and corporation blueprint owner visible to one user and
 * returns the merged stored projection.
 */
export function refreshOwnedBlueprintsForUser(
  port: OwnedBlueprintsPort,
  userId: string,
  options?: OwnerSyncRunOptions,
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(
    makeOwnedDescriptor(port, {
      resource: 'blueprints',
      isStale: BLUEPRINTS_FRESHNESS.isStale,
      eligibleCharacter: canSyncBlueprints,
      eligibleCorp: canSyncCorpBlueprints,
      requiredRoles: CORP_BLUEPRINTS_REQUIRED_ROLES,
      parse: parseBlueprintsBody,
    }),
    userId,
    options,
  );
}
