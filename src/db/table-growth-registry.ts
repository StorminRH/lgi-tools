import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { GSC_RETENTION_DAYS } from '@/data/gsc/constants';
import { SNAPSHOT_RETENTION_DAYS } from '@/data/esi-snapshots/constants';
import { ESI_REFRESH_JOB_RETENTION_DAYS } from '@/data/esi-refresh-jobs/constants';
import { HISTORY_RETENTION_DAYS } from '@/data/market-history/constants';
import { USAGE_LOG_RETENTION_DAYS } from '@/data/telemetry/constants';
import {
  CORP_ACCESS_AUDIT_RETENTION_DAYS,
  VERIFICATION_RETENTION_DAYS,
} from '@/features/auth/constants';
import * as schema from './schema';

interface ManagedTableName {
  readonly schema: string;
  readonly name: string;
}

type RegisteredTable = PgTable | ManagedTableName;

interface PrunedGrowthStory {
  readonly kind: 'pruned';
  readonly table: RegisteredTable;
  readonly retentionDays: number;
  readonly retentionConstant: string;
  readonly prunedBy: string;
  readonly alsoPurgeManagedBy?: string;
}

interface BoundedGrowthStory {
  readonly kind: 'bounded';
  readonly table: RegisteredTable;
  readonly reason: string;
}

interface PurgeManagedGrowthStory {
  readonly kind: 'purge-managed';
  readonly table: RegisteredTable;
  readonly purgeContributor: string;
}

type TableGrowthStory =
  | PrunedGrowthStory
  | BoundedGrowthStory
  | PurgeManagedGrowthStory;

export const DRIZZLE_MIGRATIONS_TABLE = {
  schema: 'drizzle',
  name: '__drizzle_migrations',
} as const;

export function tableGrowthKey(table: RegisteredTable): string {
  return is(table, PgTable) ? getTableConfig(table).name : `${table.schema}.${table.name}`;
}

// Test-only accounting for every durable Postgres table. This module is never
// imported by the DB proxy or a runtime route; the gate consumes it directly.
export const TABLE_GROWTH_STORIES = [
  {
    kind: 'pruned',
    table: schema.usageLogs,
    retentionDays: USAGE_LOG_RETENTION_DAYS,
    retentionConstant: 'USAGE_LOG_RETENTION_DAYS',
    prunedBy: 'daily /api/cron/refresh-gsc housekeeping',
    alsoPurgeManagedBy: 'telemetry',
  },
  {
    kind: 'pruned',
    table: schema.marketHistory,
    retentionDays: HISTORY_RETENTION_DAYS,
    retentionConstant: 'HISTORY_RETENTION_DAYS',
    prunedBy: 'each successful market-history refresh',
  },
  {
    kind: 'pruned',
    table: schema.corpAccessAudit,
    retentionDays: CORP_ACCESS_AUDIT_RETENTION_DAYS,
    retentionConstant: 'CORP_ACCESS_AUDIT_RETENTION_DAYS',
    prunedBy: 'daily /api/cron/refresh-gsc housekeeping',
  },
  {
    kind: 'pruned',
    table: schema.gscSearchAnalytics,
    retentionDays: GSC_RETENTION_DAYS,
    retentionConstant: 'GSC_RETENTION_DAYS',
    prunedBy: 'daily /api/cron/refresh-gsc housekeeping',
  },
  {
    kind: 'pruned',
    table: schema.gscUrlInspection,
    retentionDays: GSC_RETENTION_DAYS,
    retentionConstant: 'GSC_RETENTION_DAYS',
    prunedBy: 'daily /api/cron/refresh-gsc housekeeping',
  },
  {
    kind: 'pruned',
    table: schema.verification,
    retentionDays: VERIFICATION_RETENTION_DAYS,
    retentionConstant: 'VERIFICATION_RETENTION_DAYS',
    prunedBy: 'daily /api/cron/refresh-gsc housekeeping after expiry',
  },
  {
    kind: 'pruned',
    table: schema.esiSnapshots,
    retentionDays: SNAPSHOT_RETENTION_DAYS,
    retentionConstant: 'SNAPSHOT_RETENTION_DAYS',
    prunedBy: 'daily /api/cron/refresh-gsc housekeeping, preserving latest and referenced',
    alsoPurgeManagedBy: 'esi-snapshots',
  },
  {
    kind: 'pruned',
    table: schema.esiRefreshJobs,
    retentionDays: ESI_REFRESH_JOB_RETENTION_DAYS,
    retentionConstant: 'ESI_REFRESH_JOB_RETENTION_DAYS',
    prunedBy: 'daily /api/cron/refresh-gsc housekeeping; dead letters retained',
    alsoPurgeManagedBy: 'esi-refresh-jobs',
  },

  { kind: 'purge-managed', table: schema.session, purgeContributor: 'auth' },
  {
    kind: 'purge-managed',
    table: schema.customStructures,
    purgeContributor: 'custom-structures',
  },
  {
    kind: 'purge-managed',
    table: schema.savedPlans,
    purgeContributor: 'saved-plans',
  },

  // Imported reference/catalogue datasets replace or deterministically rebuild
  // their finite source corpus rather than appending observations over time.
  { kind: 'bounded', table: schema.sites, reason: 'replaced from the finite sites catalogue' },
  { kind: 'bounded', table: schema.waves, reason: 'children of the replaced sites catalogue' },
  { kind: 'bounded', table: schema.npcs, reason: 'children of the replaced wave catalogue' },
  {
    kind: 'bounded',
    table: schema.siteResources,
    reason: 'children of the replaced sites catalogue',
  },
  {
    kind: 'bounded',
    table: schema.escalations,
    reason: 'replaced from the finite escalation catalogue',
  },
  { kind: 'bounded', table: schema.eveCategories, reason: 'replaced from the EVE SDE' },
  { kind: 'bounded', table: schema.eveGroups, reason: 'replaced from the EVE SDE' },
  { kind: 'bounded', table: schema.eveTypes, reason: 'replaced from the EVE SDE' },
  { kind: 'bounded', table: schema.dgmAttributeTypes, reason: 'replaced from the EVE SDE' },
  { kind: 'bounded', table: schema.typeDogma, reason: 'replaced from the EVE SDE' },
  { kind: 'bounded', table: schema.industryBlueprints, reason: 'replaced from the EVE SDE' },
  {
    kind: 'bounded',
    table: schema.blueprintTrees,
    reason: 'rebuilt from the finite SDE blueprint corpus',
  },
  {
    kind: 'bounded',
    table: schema.blueprintFlatMaterials,
    reason: 'rebuilt from the finite SDE blueprint corpus',
  },
  { kind: 'bounded', table: schema.eveRegions, reason: 'replaced from the EVE SDE' },
  { kind: 'bounded', table: schema.eveConstellations, reason: 'replaced from the EVE SDE' },
  { kind: 'bounded', table: schema.eveSolarSystems, reason: 'replaced from the EVE SDE' },
  {
    kind: 'bounded',
    table: schema.eveStationOperations,
    reason: 'replaced from the EVE SDE',
  },
  { kind: 'bounded', table: schema.eveNpcStations, reason: 'replaced from the EVE SDE' },
  { kind: 'bounded', table: schema.eveSystemJumps, reason: 'replaced from the EVE SDE' },
  {
    kind: 'bounded',
    table: schema.eveDataMeta,
    reason: 'one keyed marker per finite ingest pipeline concern',
  },

  // Global snapshots are keyed by an external entity or configured source and
  // overwrite that entity's latest state.
  {
    kind: 'bounded',
    table: schema.adjustedPrices,
    reason: 'at most one latest row per EVE type',
  },
  {
    kind: 'bounded',
    table: schema.industryCostIndices,
    reason: 'at most one latest row per EVE system and activity',
  },
  { kind: 'bounded', table: schema.marketPrices, reason: 'at most one latest row per EVE type' },
  {
    kind: 'bounded',
    table: schema.marketHistoryMeta,
    reason: 'at most one freshness row per EVE type',
  },
  {
    kind: 'bounded',
    table: schema.gscSitemaps,
    reason: 'at most one latest row per submitted sitemap path',
  },

  // Identity/framework rows are keyed by a finite identity; transient OAuth
  // state is declared separately above under its expiry-based prune.
  { kind: 'bounded', table: schema.user, reason: 'at most one row per Better Auth human identity' },
  {
    kind: 'bounded',
    table: schema.account,
    reason: 'unique provider/account identity, one EVE link per character',
  },
  { kind: 'bounded', table: schema.characters, reason: 'at most one profile per EVE character' },
  {
    kind: 'bounded',
    table: schema.jwks,
    reason: 'one persisted signing key while JWT key rotation is disabled',
  },

  // Owner/corporation tables replace a keyed snapshot or have a finite key
  // vocabulary; repeated refreshes update that key-space rather than append time
  // history.
  {
    kind: 'bounded',
    table: schema.characterSkills,
    reason: 'one replace-in-place snapshot per EVE character',
  },
  {
    kind: 'bounded',
    table: schema.characterSkillSyncs,
    reason: 'one freshness row per EVE character',
  },
  {
    kind: 'bounded',
    table: schema.characterIndustryJobs,
    reason: 'one replace-in-place snapshot per EVE character',
  },
  {
    kind: 'bounded',
    table: schema.characterIndustryJobSyncs,
    reason: 'one freshness row per EVE character',
  },
  {
    kind: 'bounded',
    table: schema.corpIndustryJobs,
    reason: 'one replace-in-place snapshot per user and corporation',
  },
  {
    kind: 'bounded',
    table: schema.corpIndustryJobSyncs,
    reason: 'one freshness row per user and corporation',
  },
  {
    kind: 'bounded',
    table: schema.ownedAssets,
    reason: 'replace-all ESI snapshot rows per character or corporation owner',
  },
  {
    kind: 'bounded',
    table: schema.ownedAssetSyncs,
    reason: 'one freshness row per character or corporation owner',
  },
  {
    kind: 'bounded',
    table: schema.ownedBlueprints,
    reason: 'replace-all ESI snapshot rows per character or corporation owner',
  },
  {
    kind: 'bounded',
    table: schema.ownedBlueprintSyncs,
    reason: 'one freshness row per character or corporation owner',
  },
  {
    kind: 'bounded',
    table: schema.corpStructures,
    reason: 'replace-all ESI snapshot rows per corporation',
  },
  {
    kind: 'bounded',
    table: schema.corpStructureSyncs,
    reason: 'one freshness row per corporation',
  },
  {
    kind: 'bounded',
    table: schema.corpStructureSharing,
    reason: 'one sharing decision per corporation',
  },
  {
    kind: 'bounded',
    table: schema.corpStructureRigs,
    reason: 'at most one authored rig row per corporation structure',
  },
  {
    kind: 'bounded',
    table: schema.userPreferences,
    reason: 'one row per user and finite registered preference key',
  },

  {
    kind: 'bounded',
    table: DRIZZLE_MIGRATIONS_TABLE,
    reason: 'one immutable bookkeeping row per committed migration in the repository corpus',
  },
] as const satisfies readonly TableGrowthStory[];
