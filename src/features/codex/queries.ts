import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { characters } from '@/db/auth-schema';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { parseCodexDoc, type CodexDoc } from './doc';
import { codexPages, codexRevisions } from './schema';
import type { CodexSubject, CodexSubjectKind } from './subjects';

export const codexCacheTags = {
  index: 'codex:index',
  credits: 'codex:credits',
  page: (kind: CodexSubjectKind, key: string) => `codex:page:${kind}:${key}`,
};

export interface CodexPageView {
  readonly title: string;
  readonly updatedAt: Date;
  readonly revisionId: string;
  readonly doc: CodexDoc;
}

async function readCurrentRevision(kind: CodexSubjectKind, key: string) {
  'use cache';
  cacheLife('max');
  cacheTag(codexCacheTags.page(kind, key));
  const [row] = await withColdStartRetry(() =>
    db
      .select({
        title: codexPages.title,
        updatedAt: codexPages.updatedAt,
        revisionId: codexRevisions.id,
        doc: codexRevisions.doc,
      })
      .from(codexPages)
      .innerJoin(codexRevisions, eq(codexRevisions.id, codexPages.currentRevisionId))
      .where(and(eq(codexPages.subjectKind, kind), eq(codexPages.subjectKey, key)))
      .limit(1),
  );
  return row ?? null;
}

export async function loadCodexPage({
  kind,
  key,
}: CodexSubject): Promise<CodexPageView | null> {
  const row = await readCurrentRevision(kind, key);
  if (!row) return null;
  const parsed = parseCodexDoc(row.doc);
  if (!parsed.ok) {
    throw new Error(
      `Codex revision ${row.revisionId} of ${kind}/${key} failed to parse: ${parsed.problems.join('; ')}`,
    );
  }
  return { title: row.title, updatedAt: row.updatedAt, revisionId: row.revisionId, doc: parsed.doc };
}

export async function listCodexPages(kind: CodexSubjectKind) {
  'use cache';
  cacheLife('max');
  cacheTag(codexCacheTags.index);
  return withColdStartRetry(() =>
    db
      .select({ key: codexPages.subjectKey, title: codexPages.title, updatedAt: codexPages.updatedAt })
      .from(codexPages)
      .innerJoin(codexRevisions, eq(codexRevisions.id, codexPages.currentRevisionId))
      .where(eq(codexPages.subjectKind, kind))
      .orderBy(asc(codexPages.title)),
  );
}

export interface CodexRevisionRow {
  readonly id: string;
  readonly createdAt: Date;
  readonly origin: 'admin' | 'proposal' | 'revert';
  readonly summary: string | null;
  readonly character: CodexAuthor;
  readonly current: boolean;
}

export type CodexAuthor = { readonly id: number; readonly name: string } | null;

function authorOf(id: number | null, name: string | null): CodexAuthor {
  return id !== null && name !== null ? { id, name } : null;
}

export async function readCodexPageHead({ kind, key }: CodexSubject) {
  const [row] = await withColdStartRetry(() =>
    db
      .select({ id: codexPages.id, title: codexPages.title, currentRevisionId: codexPages.currentRevisionId })
      .from(codexPages)
      .where(and(eq(codexPages.subjectKind, kind), eq(codexPages.subjectKey, key)))
      .limit(1),
  );
  return row ?? null;
}

export async function listCodexRevisions(
  subject: CodexSubject,
): Promise<{ title: string; revisions: CodexRevisionRow[] } | null> {
  const page = await readCodexPageHead(subject);
  if (!page) return null;
  const rows = await withColdStartRetry(() =>
    db
      .select({
        id: codexRevisions.id,
        createdAt: codexRevisions.createdAt,
        origin: codexRevisions.origin,
        summary: codexRevisions.summary,
        characterId: codexRevisions.characterId,
        characterName: characters.name,
      })
      .from(codexRevisions)
      .leftJoin(characters, eq(characters.characterId, codexRevisions.characterId))
      .where(eq(codexRevisions.pageId, page.id))
      .orderBy(desc(codexRevisions.createdAt), desc(codexRevisions.id)),
  );
  return {
    title: page.title,
    revisions: rows.map(({ characterId, characterName, ...row }) => ({
      ...row,
      character: authorOf(characterId, characterName),
      current: row.id === page.currentRevisionId,
    })),
  };
}

export interface CodexRecentEdit {
  readonly kind: CodexSubjectKind;
  readonly key: string;
  readonly title: string;
  readonly updatedAt: Date;
  readonly summary: string | null;
  readonly origin: CodexRevisionRow['origin'];
  readonly character: CodexAuthor;
}

export async function listRecentCodexEdits(limit = 5): Promise<CodexRecentEdit[]> {
  'use cache';
  cacheLife('max');
  cacheTag(codexCacheTags.index);
  const rows = await withColdStartRetry(() =>
    db
      .select({
        kind: codexPages.subjectKind,
        key: codexPages.subjectKey,
        title: codexPages.title,
        updatedAt: codexPages.updatedAt,
        summary: codexRevisions.summary,
        origin: codexRevisions.origin,
        characterId: characters.characterId,
        characterName: characters.name,
      })
      .from(codexPages)
      .innerJoin(codexRevisions, eq(codexRevisions.id, codexPages.currentRevisionId))
      .leftJoin(characters, eq(characters.characterId, codexRevisions.characterId))
      .orderBy(desc(codexPages.updatedAt))
      .limit(limit),
  );
  return rows.map(({ kind, characterId, characterName, ...row }) => ({
    ...row,
    kind: kind as CodexSubjectKind,
    character: authorOf(characterId, characterName),
  }));
}

export interface CodexCredit {
  readonly characterId: number;
  readonly name: string;
  readonly edits: number;
}

export async function listCodexCredits({ kind, key }: CodexSubject): Promise<CodexCredit[]> {
  'use cache';
  cacheLife('max');
  cacheTag(codexCacheTags.page(kind, key), codexCacheTags.credits);
  return withColdStartRetry(() =>
    db
      .select({
        characterId: characters.characterId,
        name: characters.name,
        edits: sql<number>`count(*)`.mapWith(Number),
      })
      .from(codexRevisions)
      .innerJoin(codexPages, eq(codexPages.id, codexRevisions.pageId))
      .innerJoin(characters, eq(characters.characterId, codexRevisions.characterId))
      .where(and(eq(codexPages.subjectKind, kind), eq(codexPages.subjectKey, key)))
      .groupBy(characters.characterId, characters.name)
      .orderBy(sql`min(${codexRevisions.createdAt})`, asc(characters.characterId)),
  );
}
