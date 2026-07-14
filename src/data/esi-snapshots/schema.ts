import { bigint, bigserial, index, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { ESI_SNAPSHOT_OWNER_TYPES } from './constants';
import type { EsiSnapshotResponseHeaders } from './types';

export const esiSnapshotOwnerTypeEnum = pgEnum(
  'esi_snapshot_owner_type',
  ESI_SNAPSHOT_OWNER_TYPES,
);

export const esiSnapshots = pgTable(
  'esi_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ownerType: esiSnapshotOwnerTypeEnum('owner_type').notNull(),
    ownerId: bigint('owner_id', { mode: 'number' }).notNull(),
    endpoint: text('endpoint').notNull(),
    requestHash: text('request_hash').notNull(),
    etag: text('etag'),
    responseHeaders: jsonb('response_headers').$type<EsiSnapshotResponseHeaders>().notNull(),
    fetchedAt: timestamp('fetched_at', { mode: 'date' }).notNull(),
    sourceVersion: text('source_version').notNull(),
    bodyCiphertext: text('body_ciphertext').notNull(),
  },
  (t) => [
    index('esi_snapshots_owner_endpoint_fetched_idx').on(
      t.ownerType,
      t.ownerId,
      t.endpoint,
      t.fetchedAt,
      t.id,
    ),
    index('esi_snapshots_fetched_at_idx').on(t.fetchedAt),
  ],
);
