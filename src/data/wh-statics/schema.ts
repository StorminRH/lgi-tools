import {
  bigserial,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  bigint,
} from 'drizzle-orm/pg-core';
import { WH_STATICS_SNAPSHOT_STATUSES } from './constants';
import type { StaticsCrossCheck } from './cross-check';
import type { StaticsDiff } from './diff';
import type { StaticsEntry } from './parse';

/**
 * Drizzle schema owner for wh-statics snapshot status; migrations, queries, and
 * the review screen derive from this single declaration.
 */
export const whStaticsSnapshotStatusEnum = pgEnum(
  'wh_statics_snapshot_status',
  WH_STATICS_SNAPSHOT_STATUSES,
);

/**
 * Holding-pen row for one validated anoik.is statics snapshot awaiting operator
 * promote or reject. Never read by a serving path.
 */
export const whStaticsSnapshots = pgTable('wh_statics_snapshots', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  feedVersion: text('feed_version').notNull(),
  etag: text('etag').notNull(),
  lastModified: text('last_modified'),
  digest: text('digest').notNull(),
  systemCount: integer('system_count').notNull(),
  status: whStaticsSnapshotStatusEnum('status').notNull().default('pending'),
  entries: jsonb('entries').$type<StaticsEntry[]>().notNull(),
  diff: jsonb('diff').$type<StaticsDiff>().notNull(),
  crossCheck: jsonb('cross_check').$type<StaticsCrossCheck>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

/**
 * Promoted serving copy of per-system wormhole statics. The only table the
 * request-path read may consult; replaced atomically on operator promote.
 */
export const whSystemStatics = pgTable(
  'wh_system_statics',
  {
    systemId: integer('system_id').notNull(),
    code: text('code').notNull(),
    version: text('version').notNull(),
    snapshotId: bigint('snapshot_id', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.systemId, t.code] })],
);
