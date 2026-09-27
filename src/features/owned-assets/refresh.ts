import {
  type EnumeratedOwner,
  makeOwnedDescriptor,
  type OwnedDatasetSpec,
  runOwnerSync,
  type OwnerSyncResult,
  type OwnerSyncRunOptions,
} from '@/platform/owner-sync';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { CORP_ASSETS_REQUIRED_ROLES, canSyncCorpAssets } from './corp-sync-eligibility';
import { type OwnedAsset, parseAssetsBody } from './esi-projection';
import { canSyncAssets } from './sync-eligibility';
import type { OwnedAssetsPort } from './types';

const ASSETS_FRESHNESS = freshnessGate('owned_assets');

function assetsSpec(eligibleCorp: (owner: EnumeratedOwner) => boolean): OwnedDatasetSpec<OwnedAsset> {
  return {
    resource: 'assets',
    isStale: ASSETS_FRESHNESS.isStale,
    eligibleCharacter: canSyncAssets,
    eligibleCorp,
    requiredRoles: CORP_ASSETS_REQUIRED_ROLES,
    parse: parseAssetsBody,
  };
}

export function refreshOwnedAssetsForUser(
  port: OwnedAssetsPort,
  userId: string,
  options?: OwnerSyncRunOptions,
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(makeOwnedDescriptor(port, assetsSpec(canSyncCorpAssets)), userId, options);
}

/** The home board's variant: personal hangars only, never a Director's corporation pass. */
export function refreshCharacterOwnedAssetsForUser(
  port: OwnedAssetsPort,
  userId: string,
  options?: OwnerSyncRunOptions,
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(makeOwnedDescriptor(port, assetsSpec(() => false)), userId, options);
}
