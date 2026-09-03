import {
  makeOwnedDescriptor,
  runOwnerSync,
  type OwnerSyncResult,
  type OwnerSyncRunOptions,
} from '@/platform/owner-sync';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { CORP_ASSETS_REQUIRED_ROLES, canSyncCorpAssets } from './corp-sync-eligibility';
import { parseAssetsBody } from './esi-projection';
import { canSyncAssets } from './sync-eligibility';
import type { OwnedAssetsPort } from './types';

const ASSETS_FRESHNESS = freshnessGate('owned_assets');

export function refreshOwnedAssetsForUser(
  port: OwnedAssetsPort,
  userId: string,
  options?: OwnerSyncRunOptions,
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(
    makeOwnedDescriptor(port, {
      resource: 'assets',
      isStale: ASSETS_FRESHNESS.isStale,
      eligibleCharacter: canSyncAssets,
      eligibleCorp: canSyncCorpAssets,
      requiredRoles: CORP_ASSETS_REQUIRED_ROLES,
      parse: parseAssetsBody,
    }),
    userId,
    options,
  );
}
