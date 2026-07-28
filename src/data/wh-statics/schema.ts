import {
  bigint,
  bigserial,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/** Persisted statics snapshot states; this tuple owns the TypeScript and Postgres vocabulary. */
export const WH_STATICS_SNAPSHOT_STATUSES = [
  'pending',
  'promoted',
  'rejected',
  'superseded',
] as const;

/** One persisted statics snapshot state. */
export type WhStaticsSnapshotStatus =
  (typeof WH_STATICS_SNAPSHOT_STATUSES)[number];

/** Drizzle owner of the statics snapshot-status enum. */
export const whStaticsSnapshotStatusEnum = pgEnum(
  'wh_statics_snapshot_status',
  WH_STATICS_SNAPSHOT_STATUSES,
);

/** One normalized system-to-wormhole-code assignment from the community feed. */
export interface WhStaticEntry {
  readonly systemId: number;
  readonly systemName: string;
  readonly code: string;
}

/** One system whose promoted and incoming static-code sets differ. */
export interface WhStaticsChangedSystem {
  readonly systemId: number;
  readonly before: readonly string[];
  readonly after: readonly string[];
}

/** Complete difference summary stored with a pending statics snapshot. */
export interface WhStaticsDiff {
  readonly systemsAdded: readonly number[];
  readonly systemsRemoved: readonly number[];
  readonly systemsChanged: readonly WhStaticsChangedSystem[];
  readonly codesAdded: readonly string[];
  readonly codesRemoved: readonly string[];
  readonly totalDifferences: number;
}

/** One feed-versus-lineage disagreement retained for operator review. */
export interface WhStaticsDisagreement {
  readonly systemId: number;
  readonly feedCodes: readonly string[];
  readonly lineageCodes: readonly string[];
}

/** Independent-lineage comparison retained with a pending statics snapshot. */
export interface WhStaticsCrossCheck {
  readonly agreedSystems: number;
  readonly disagreements: readonly WhStaticsDisagreement[];
  readonly lineageOnlySystems: readonly number[];
  readonly feedOnlySystems: readonly number[];
}

/** Holding pen for a validated, diffed, and lineage-checked community snapshot. */
export const whStaticsSnapshots = pgTable('wh_statics_snapshots', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  feedVersion: text('feed_version').notNull(),
  etag: text('etag'),
  lastModified: text('last_modified'),
  digest: text('digest').notNull(),
  systemCount: integer('system_count').notNull(),
  status: whStaticsSnapshotStatusEnum('status').notNull().default('pending'),
  entries: jsonb('entries').$type<readonly WhStaticEntry[]>().notNull(),
  difference: jsonb('difference').$type<WhStaticsDiff>().notNull(),
  crossCheck: jsonb('cross_check').$type<WhStaticsCrossCheck>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Promoted serving copy, keyed by system and code and bound to its source snapshot. */
export const whSystemStatics = pgTable(
  'wh_system_statics',
  {
    systemId: integer('system_id').notNull(),
    code: text('code').notNull(),
    feedVersion: text('feed_version').notNull(),
    sourceSnapshotId: bigint('source_snapshot_id', { mode: 'number' })
      .notNull()
      .references(() => whStaticsSnapshots.id),
  },
  (table) => [
    primaryKey({ columns: [table.systemId, table.code] }),
  ],
);
