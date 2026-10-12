import {
  makeOwnedDescriptor,
  runOwnerSync,
  type OwnerSyncResult,
} from '@/platform/owner-sync';
import { CORP_BLUEPRINTS_REQUIRED_ROLES, canSyncCorpBlueprints } from './corp-sync-eligibility';
import { parseBlueprintsBody } from './esi-projection';
import { canSyncBlueprints } from './sync-eligibility';
import type { OwnedBlueprintsPort } from './types';

export function refreshOwnedBlueprintsForUser(
  port: OwnedBlueprintsPort,
  userId: string,
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(
    makeOwnedDescriptor(port, {
      resource: 'blueprints',
      eligibleCharacter: canSyncBlueprints,
      eligibleCorp: canSyncCorpBlueprints,
      requiredRoles: CORP_BLUEPRINTS_REQUIRED_ROLES,
      parse: parseBlueprintsBody,
    }),
    userId,
  );
}
