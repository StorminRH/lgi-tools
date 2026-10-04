import { and, asc, desc, eq } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { characters } from '@/db/auth-schema';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { parseCodexDoc, type CodexDoc } from './doc';
import { codexPages, codexRevisions } from './schema';
import type { CodexSubject, CodexSubjectKind } from './subjects';

export const codexCacheTags = {
  index: 'codex:index',
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
  readonly character: { readonly id: number; readonly name: string } | null;
  readonly current: boolean;
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
      character:
        characterId !== null && characterName !== null ? { id: characterId, name: characterName } : null,
      current: row.id === page.currentRevisionId,
    })),
  };
}
