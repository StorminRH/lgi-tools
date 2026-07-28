import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/** Snapshot review states; this tuple is the single TypeScript and Postgres vocabulary. */
export const WH_STATICS_SNAPSHOT_STATUSES = [
  'pending',
  'promoted',
  'rejected',
  'superseded',
] as const;

/** One persisted statics-snapshot review state. */
export type WhStaticsSnapshotStatus =
  (typeof WH_STATICS_SNAPSHOT_STATUSES)[number];

/** Drizzle owner of the statics-snapshot review-state enum. */
export const whStaticsSnapshotStatusEnum = pgEnum(
  'wh_statics_snapshot_status',
  WH_STATICS_SNAPSHOT_STATUSES,
);

/**
 * Holding pen for one validated community-feed snapshot and its review evidence.
 * Serving never reads this table directly.
 */
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
    entries: jsonb('entries').notNull(),
    difference: jsonb('difference').notNull(),
    crossCheck: jsonb('cross_check').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('wh_statics_snapshots_status_created_at_idx').on(
      table.status,
      table.createdAt,
    ),
  ],
);

/**
 * Promoted, runtime-serving copy of per-system statics.
 * Each row remains bound to the reviewed snapshot that supplied it.
 */
export const whSystemStatics = pgTable(
  'wh_system_statics',
  {
    systemId: bigint('system_id', { mode: 'number' }).notNull(),
    code: text('code').notNull(),
    sourceSnapshotId: bigint('source_snapshot_id', { mode: 'number' })
      .notNull()
      .references(() => whStaticsSnapshots.id),
  },
  (table) => [
    primaryKey({ columns: [table.systemId, table.code] }),
    index('wh_system_statics_source_snapshot_idx').on(table.sourceSnapshotId),
  ],
);
