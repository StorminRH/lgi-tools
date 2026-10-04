import {
  bigint,
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
  ],
);
