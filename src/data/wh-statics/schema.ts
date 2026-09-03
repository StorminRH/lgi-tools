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
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const WH_STATICS_SNAPSHOT_STATUSES = [
  'pending',
  'promoted',
  'rejected',
  'superseded',
] as const;

export type WhStaticsSnapshotStatus =
  (typeof WH_STATICS_SNAPSHOT_STATUSES)[number];

export const whStaticsSnapshotStatusEnum = pgEnum(
  'wh_statics_snapshot_status',
  WH_STATICS_SNAPSHOT_STATUSES,
);

export interface WhStaticEntry {
  readonly systemId: number;
  readonly systemName: string;
  readonly code: string;
}

export interface WhStaticsChangedSystem {
  readonly systemId: number;
  readonly before: readonly string[];
  readonly after: readonly string[];
}

export interface WhStaticsSystemCodes {
  readonly systemId: number;
  readonly codes: readonly string[];
}

export interface WhStaticsDiff {
  readonly systemsAdded: readonly WhStaticsSystemCodes[];
  readonly systemsRemoved: readonly WhStaticsSystemCodes[];
  readonly systemsChanged: readonly WhStaticsChangedSystem[];
  readonly codesAdded: readonly string[];
  readonly codesRemoved: readonly string[];
  readonly totalDifferences: number;
}

export interface WhStaticsDisagreement {
  readonly systemId: number;
  readonly feedCodes: readonly string[];
  readonly lineageCodes: readonly string[];
}

export interface WhStaticsCrossCheck {
  readonly agreedSystems: number;
  readonly disagreements: readonly WhStaticsDisagreement[];
  readonly lineageOnlySystems: readonly number[];
  readonly feedOnlySystems: readonly number[];
}

export const whStaticsSnapshots = pgTable(
  'wh_statics_snapshots',
  {
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('wh_statics_snapshots_single_pending')
      .on(table.status)
      .where(sql`${table.status} = 'pending'`),
  ],
);

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
