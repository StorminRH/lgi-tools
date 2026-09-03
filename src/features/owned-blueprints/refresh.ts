import {
  makeOwnedDescriptor,
  runOwnerSync,
  type OwnerSyncResult,
  type OwnerSyncRunOptions,
} from '@/platform/owner-sync';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { CORP_BLUEPRINTS_REQUIRED_ROLES, canSyncCorpBlueprints } from './corp-sync-eligibility';
import { parseBlueprintsBody } from './esi-projection';
import { canSyncBlueprints } from './sync-eligibility';
import type { OwnedBlueprintsPort } from './types';

const BLUEPRINTS_FRESHNESS = freshnessGate('owned_blueprints');

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
