import { sql } from 'drizzle-orm';
import { bigint, index, jsonb, pgEnum, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { ESI_OWNER_TYPES } from '@/platform/owner-sync/owner-type';

export const ESI_RESPONSE_HOLDER_TYPES = [...ESI_OWNER_TYPES, 'global'] as const;

export const esiResponseHolderEnum = pgEnum('esi_response_holder', ESI_RESPONSE_HOLDER_TYPES);

/**
 * What CCP last said about one ESI request: when the answer expires, the
 * ETag(s) to send back, and when we last asked. One row per route, holder
 * and canonical parameter set. A `user-corporation` holder is a corporation
 * row with `user_id` set, since corp industry jobs are stored per user and
 * corporation. `expires_at` null means due. `etags` holds one entry per
 * page of a paged read. `body` is kept only for `keepBody` routes, whose
 * whole document is small enough to live in the row (the server status).
 */
export const esiResponses = pgTable(
  'esi_responses',
  {
    route: text('route').notNull(),
    holderType: esiResponseHolderEnum('holder_type').notNull(),
    holderId: bigint('holder_id', { mode: 'number' }).notNull(),
    userId: text('user_id').notNull().default(''),
    params: text('params').notNull().default(''),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    etags: text('etags').array().notNull().default(sql`'{}'::text[]`),
    lastModified: timestamp('last_modified', { withTimezone: true }),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull(),
    body: jsonb('body'),
  },
  (t) => [
    primaryKey({ columns: [t.route, t.holderType, t.holderId, t.userId, t.params] }),
    index('esi_responses_holder_idx').on(t.holderType, t.holderId),
  ],
);
