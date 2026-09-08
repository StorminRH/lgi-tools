import { and, count, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import { corpAccessAudit } from '@/db/auth-schema';
import { domainEvents } from '@/data/domain-events/schema';
import { esiRefreshJobs } from '@/data/esi-refresh-jobs/schema';
import { esiSnapshots } from '@/data/esi-snapshots/schema';
import { userPreferences } from '@/data/preferences/schema';
import { usageLogs } from '@/data/telemetry/schema';
import { customStructures } from '@/features/custom-structures/schema';
import { characterIndustryJobs, characterIndustryJobSyncs, corpIndustryJobs, corpIndustryJobSyncs } from '@/features/industry-jobs/schema';
import { savedPlans } from '@/features/industry-planner/schema';
import { ownedAssets, ownedAssetSyncs } from '@/features/owned-assets/schema';
import { ownedBlueprints, ownedBlueprintSyncs } from '@/features/owned-blueprints/schema';
import { characterSkills, characterSkillSyncs } from '@/features/skill-queue/schema';

type Scope = { name: string; table: PgTable; where: SQL | undefined };

function projectionScopes(userIds: string[], characterIds: number[]): Scope[] {
  return [
    { name: 'preferences', table: userPreferences, where: inArray(userPreferences.userId, userIds) },
    { name: 'savedPlans', table: savedPlans, where: inArray(savedPlans.userId, userIds) },
    { name: 'customStructures', table: customStructures, where: inArray(customStructures.userId, userIds) },
    { name: 'corpAudit', table: corpAccessAudit, where: inArray(corpAccessAudit.userId, userIds) },
    { name: 'refreshJobs', table: esiRefreshJobs, where: inArray(esiRefreshJobs.userId, userIds) },
    { name: 'corpJobs', table: corpIndustryJobs, where: inArray(corpIndustryJobs.userId, userIds) },
    { name: 'corpJobSyncs', table: corpIndustryJobSyncs, where: inArray(corpIndustryJobSyncs.userId, userIds) },
    { name: 'characterJobs', table: characterIndustryJobs, where: inArray(characterIndustryJobs.characterId, characterIds) },
    { name: 'characterJobSyncs', table: characterIndustryJobSyncs, where: inArray(characterIndustryJobSyncs.characterId, characterIds) },
    { name: 'skills', table: characterSkills, where: inArray(characterSkills.characterId, characterIds) },
    { name: 'skillSyncs', table: characterSkillSyncs, where: inArray(characterSkillSyncs.characterId, characterIds) },
    { name: 'usageLogs', table: usageLogs, where: inArray(usageLogs.characterId, characterIds) },
    { name: 'ownedAssets', table: ownedAssets, where: and(eq(ownedAssets.ownerType, 'character'), inArray(ownedAssets.ownerId, characterIds)) },
    { name: 'assetSyncs', table: ownedAssetSyncs, where: and(eq(ownedAssetSyncs.ownerType, 'character'), inArray(ownedAssetSyncs.ownerId, characterIds)) },
    { name: 'ownedBlueprints', table: ownedBlueprints, where: and(eq(ownedBlueprints.ownerType, 'character'), inArray(ownedBlueprints.ownerId, characterIds)) },
    { name: 'blueprintSyncs', table: ownedBlueprintSyncs, where: and(eq(ownedBlueprintSyncs.ownerType, 'character'), inArray(ownedBlueprintSyncs.ownerId, characterIds)) },
    { name: 'snapshots', table: esiSnapshots, where: and(eq(esiSnapshots.ownerType, 'character'), inArray(esiSnapshots.ownerId, characterIds)) },
    { name: 'domainEvents', table: domainEvents, where: or(
      inArray(sql`${domainEvents.metadata}->>'characterId'`, characterIds.map(String)),
      and(eq(sql`${domainEvents.metadata}->>'ownerType'`, 'character'),
        inArray(sql`${domainEvents.metadata}->>'ownerId'`, characterIds.map(String))),
    ) },
  ];
}

export async function purgeFixtureProjections(userIds: string[], characterIds: number[]) {
  const errors: unknown[] = [];
  for (const scope of projectionScopes(userIds, characterIds)) {
    if (!scope.where) throw new Error('E2E_CLEANUP: refusing unscoped projection deletion');
    try { await db.delete(scope.table).where(scope.where); } catch (error) { errors.push(error); }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'E2E_CLEANUP: owned PostgreSQL projection cleanup failed');
}

export async function censusFixtureProjections(userIds: string[], characterIds: number[]) {
  const counts: Record<string, number> = {};
  for (const scope of projectionScopes(userIds, characterIds)) {
    if (!scope.where) throw new Error('E2E_CLEANUP: refusing unscoped projection census');
    const [row] = await db.select({ count: count() }).from(scope.table).where(scope.where);
    if (!row) throw new Error('E2E_CLEANUP: missing projection census result');
    counts[scope.name] = row.count;
  }
  return counts;
}
