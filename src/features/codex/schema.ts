import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { characters, user } from '@/db/auth-schema';

export const codexRevisionOriginEnum = pgEnum('codex_revision_origin', [
  'admin',
  'proposal',
  'revert',
]);

export const codexPages = pgTable(
  'codex_pages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subjectKind: text('subject_kind').notNull(),
    subjectKey: text('subject_key').notNull(),
    title: text('title').notNull(),
    currentRevisionId: uuid('current_revision_id').references(
      (): AnyPgColumn => codexRevisions.id,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('codex_pages_subject_unique').on(table.subjectKind, table.subjectKey),
  ],
);

export const codexRevisions = pgTable(
  'codex_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => codexPages.id, { onDelete: 'cascade' }),
    parentRevisionId: uuid('parent_revision_id').references(
      (): AnyPgColumn => codexRevisions.id,
    ),
    doc: jsonb('doc').$type<unknown>().notNull(),
    schemaVersion: integer('schema_version').notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    characterId: bigint('character_id', { mode: 'number' }).references(
      () => characters.characterId,
      { onDelete: 'set null' },
    ),
    origin: codexRevisionOriginEnum('origin').notNull(),
    originRef: text('origin_ref'),
    summary: text('summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('codex_revisions_page_idx').on(table.pageId, table.createdAt),
    index('codex_revisions_user_idx').on(table.userId),
    index('codex_revisions_character_idx').on(table.characterId),
    uniqueIndex('codex_revisions_proposal_unique').on(table.originRef).where(sql`${table.origin} = 'proposal'`),
  ],
);

export const codexProposalStatusEnum = pgEnum('codex_proposal_status', [
  'pending',
  'approved',
  'denied',
  'withdrawn',
]);

export type CodexProposalStatus = (typeof codexProposalStatusEnum.enumValues)[number];

export const codexProposals = pgTable(
  'codex_proposals',
  {
    id: uuid('id').primaryKey(),
    subjectKind: text('subject_kind').notNull(),
    subjectKey: text('subject_key').notNull(),
    pageTitle: text('page_title').notNull(),
    baseRevisionId: uuid('base_revision_id').references(() => codexRevisions.id),
    sectionId: text('section_id').notNull(),
    doc: jsonb('doc').$type<unknown>().notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    characterId: bigint('character_id', { mode: 'number' })
      .notNull()
      .references(() => characters.characterId, { onDelete: 'cascade' }),
    summary: text('summary').notNull(),
    status: codexProposalStatusEnum('status').default('pending').notNull(),
    reviewNote: text('review_note'),
    resultRevisionId: uuid('result_revision_id').references(() => codexRevisions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'codex_proposals_approved_has_result',
      sql`(${table.status} = 'approved') = (${table.resultRevisionId} IS NOT NULL)`,
    ),
    check('codex_proposals_pending_undecided', sql`(${table.status} = 'pending') = (${table.decidedAt} IS NULL)`),
    check(
      'codex_proposals_denied_has_note',
      sql`${table.status} <> 'denied' OR coalesce(length(trim(${table.reviewNote})), 0) > 0`,
    ),
    index('codex_proposals_status_idx').on(table.status, table.createdAt),
    index('codex_proposals_user_idx').on(table.userId, table.createdAt),
    index('codex_proposals_user_pending_idx')
      .on(table.userId, table.subjectKind, table.subjectKey)
      .where(sql`${table.status} = 'pending'`),
  ],
);
