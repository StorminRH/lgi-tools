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
import { WH_STATICS_SNAPSHOT_STATUSES } from './constants';
import type { StaticsCrossCheck, StaticsDiff, WhStaticsEntry } from './types';

/**
 * Drizzle owner of the snapshot-status enum; migrations, queries, and the admin
 * surface derive from this single declaration.
 */
export const whStaticsSnapshotStatusEnum = pgEnum(
  'wh_statics_snapshot_status',
  WH_STATICS_SNAPSHOT_STATUSES,
);

/**
 * Holding-pen snapshots of the anoik.is statics feed. At most one row is
 * `pending` at a time; the serving path never reads this table.
 */
export const whStaticsSnapshots = pgTable('wh_statics_snapshots', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  feedVersion: text('feed_version').notNull(),
  etag: text('etag'),
  lastModified: text('last_modified'),
  digest: text('digest').notNull(),
  systemCount: integer('system_count').notNull(),
  status: whStaticsSnapshotStatusEnum('status').notNull(),
  entries: jsonb('entries').$type<WhStaticsEntry[]>().notNull(),
  difference: jsonb('difference').$type<StaticsDiff>().notNull(),
  crossCheck: jsonb('cross_check').$type<StaticsCrossCheck>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

/**
 * Promoted community statics copy served to callers. Keyed by `(system_id, code)`;
 * replaced wholesale on promote. Never written by a refresh path.
 */
export const whSystemStatics = pgTable(
  'wh_system_statics',
  {
    systemId: integer('system_id').notNull(),
    code: text('code').notNull(),
    sourceSnapshotId: bigint('source_snapshot_id', { mode: 'number' }).notNull(),
    sourceVersion: text('source_version').notNull(),
  },
  (t) => [primaryKey({ columns: [t.systemId, t.code] })],
);
