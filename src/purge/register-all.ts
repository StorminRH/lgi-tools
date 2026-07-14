// Purge-contributor wiring manifest. Lives in the unclassified src/purge/ layer
// ABOVE the feature/data slices (the src/search/register-all.ts pattern): it PULLS
// each slice's exported purge contributor and composes them into one list the
// orchestrator runs and the CI gate audits. No slice imports a layer above itself —
// slices import only the contributor TYPE from @/purge/types. This manifest is the
// single consumer that keeps every contributor reachable (no unused-exports).
//
// The PURGE_CONTRIBUTORS array below is listed in tier order for readability (the
// imports are path-grouped); the orchestrator sorts by tier regardless.
import { customStructuresPurgeContributor } from '@/features/custom-structures/purge';
import { savedPlansPurgeContributor } from '@/features/industry-planner/purge';
import { authPurgeContributor } from '@/features/auth/purge';
import { industryJobsPurgeContributor } from '@/features/industry-jobs/purge';
import { ownedAssetsPurgeContributor } from '@/features/owned-assets/purge';
import { ownedBlueprintsPurgeContributor } from '@/features/owned-blueprints/purge';
import { onlineStatusPurgeContributor } from '@/features/online-status/purge';
import { skillQueuePurgeContributor } from '@/features/skill-queue/purge';
import { preferencesPurgeContributor } from '@/data/preferences/purge';
import { esiSnapshotsPurgeContributor } from '@/data/esi-snapshots/purge';
import { telemetryPurgeContributor } from '@/data/telemetry/purge';
import type { PurgeContributor } from './types';

export const PURGE_CONTRIBUTORS: readonly PurgeContributor[] = [
  authPurgeContributor,
  skillQueuePurgeContributor,
  industryJobsPurgeContributor,
  ownedAssetsPurgeContributor,
  ownedBlueprintsPurgeContributor,
  esiSnapshotsPurgeContributor,
  onlineStatusPurgeContributor,
  telemetryPurgeContributor,
  preferencesPurgeContributor,
  customStructuresPurgeContributor,
  savedPlansPurgeContributor,
];
