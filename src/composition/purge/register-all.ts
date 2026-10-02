import { purgeUserMapAccessProjection } from '@/composition/map-access-projection';
import { deliverCapturedMapAccessChanges } from '@/composition/map-affiliation-access';
import { purgeMapChain } from '@/composition/map-purge';
import { customStructuresPurgeContributor } from '@/features/custom-structures/purge';
import {
  industryProfilesPurgeContributor,
  savedPlansPurgeContributor,
} from '@/features/industry-planner/purge';
import { authPurgeContributor } from '@/platform/auth/purge';
import { corpRolesPurgeContributor } from '@/platform/auth/corp-roles-purge';
import { corpHoldingsPurgeContributor } from '@/data/corp-holdings/purge';
import { industryJobsPurgeContributor } from '@/features/industry-jobs/purge';
import { ownedAssetsPurgeContributor } from '@/features/owned-assets/purge';
import { ownedBlueprintsPurgeContributor } from '@/features/owned-blueprints/purge';
import { onlineStatusPurgeContributor } from '@/data/online-status/purge';
import { locationTrackingPurgeContributor } from '@/data/location-tracking/purge';
import { skillQueuePurgeContributor } from '@/features/skill-queue/purge';
import { characterSheetPurgeContributor } from '@/features/character-sheet/purge';
import { netWorthPurgeContributor } from '@/features/net-worth/purge';
import { preferencesPurgeContributor } from '@/data/preferences/purge';
import { esiSnapshotsPurgeContributor } from '@/data/esi-snapshots/purge';
import { esiRefreshJobsPurgeContributor } from '@/data/esi-refresh-jobs/purge';
import { telemetryPurgeContributor } from '@/data/telemetry/purge';
import { createMapsPurgeContributor } from '@/data/maps/purge';
import type { PurgeContributor } from '@/platform/purge/types';

const mapsPurgeContributor = createMapsPurgeContributor({
  deliverCaptured: deliverCapturedMapAccessChanges,
  purgeMapChain,
  purgeUserClaims: purgeUserMapAccessProjection,
});

export const PURGE_CONTRIBUTORS: readonly PurgeContributor[] = [
  authPurgeContributor,
  mapsPurgeContributor,
  skillQueuePurgeContributor,
  characterSheetPurgeContributor,
  industryJobsPurgeContributor,
  ownedAssetsPurgeContributor,
  ownedBlueprintsPurgeContributor,
  corpRolesPurgeContributor,
  corpHoldingsPurgeContributor,
  esiSnapshotsPurgeContributor,
  esiRefreshJobsPurgeContributor,
  onlineStatusPurgeContributor,
  locationTrackingPurgeContributor,
  telemetryPurgeContributor,
  preferencesPurgeContributor,
  customStructuresPurgeContributor,
  savedPlansPurgeContributor,
  industryProfilesPurgeContributor,
  netWorthPurgeContributor,
];
