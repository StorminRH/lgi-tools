import { and, asc, eq } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { parseCodexDoc, type CodexDoc } from './doc';
import { codexPages, codexRevisions } from './schema';
import type { CodexSubject, CodexSubjectKind } from './subjects';

const codexCacheTags = {
  index: 'codex:index',
  page: (kind: CodexSubjectKind, key: string) => `codex:page:${kind}:${key}`,
};

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
}: CodexSubject): Promise<{ title: string; updatedAt: Date; doc: CodexDoc } | null> {
  const row = await readCurrentRevision(kind, key);
  if (!row) return null;
  const parsed = parseCodexDoc(row.doc);
  if (!parsed.ok) {
    throw new Error(
      `Codex revision ${row.revisionId} of ${kind}/${key} failed to parse: ${parsed.problems.join('; ')}`,
    );
  }
  return { title: row.title, updatedAt: row.updatedAt, doc: parsed.doc };
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
