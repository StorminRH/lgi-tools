import { and, eq, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db } from '@/db';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { parseCodexDoc, type CodexBlockNode, type CodexDoc, type CodexNode } from './doc';
import { codexCacheTags, readCodexPageHead } from './queries';
import { codexPages, codexRevisions } from './schema';
import { sectionBounds } from './sections';
import type { CodexSubject } from './subjects';

export type CodexEdit =
  | { readonly kind: 'section'; readonly sectionId: string; readonly blocks: readonly unknown[] }
  | { readonly kind: 'page'; readonly blocks: readonly unknown[] }
  | { readonly kind: 'restore'; readonly revisionId: string };

export interface CodexPublishRequest {
  readonly subject: CodexSubject;
  readonly title: string | null;
  readonly baseRevisionId: string | null;
  readonly template?: CodexDoc | null;
  readonly edit: CodexEdit;
  readonly summary: string | null;
  readonly author: { readonly userId: string; readonly characterId: number | null };
}

export type CodexPublishResult =
  | { readonly status: 'published'; readonly revisionId: string }
  | { readonly status: 'conflict' }
  | { readonly status: 'invalid'; readonly problems: readonly string[] };

type Composed = { ok: true; doc: CodexDoc; stored: CodexStoredDoc } | { ok: false; problems: string[] };

interface CodexStoredDoc {
  readonly content: readonly unknown[];
}

const CONFLICT: CodexPublishResult = { status: 'conflict' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectIds(nodes: readonly CodexNode[], into: Set<string>): Set<string> {
  for (const node of nodes) {
    if (node.type === 'text') continue;
    if ('id' in node.attrs && node.attrs.id) into.add(node.attrs.id);
    collectIds(node.content, into);
  }
  return into;
}

function rekey(node: unknown, taken: Set<string>, newId: () => string, topLevel: boolean): unknown {
  if (!isRecord(node)) return node;
  const attrs = isRecord(node.attrs) ? node.attrs : {};
  const id = typeof attrs.id === 'string' && attrs.id !== '' ? attrs.id : null;
  let next = node;
  if (topLevel || id !== null) {
    const fresh = id !== null && !taken.has(id) ? id : newId();
    taken.add(fresh);
    next = { ...node, attrs: { ...attrs, id: fresh } };
  }
  if (!Array.isArray(node.content)) return next;
  return { ...next, content: node.content.map((child) => rekey(child, taken, newId, false)) };
}

function withFreshIds(
  incoming: readonly unknown[],
  kept: readonly CodexBlockNode[],
  newId: () => string,
): unknown[] {
  const taken = collectIds(kept, new Set());
  return incoming.map((block) => rekey(block, taken, newId, true));
}

async function readRevisionDoc(pageId: string, revisionId: string): Promise<Composed> {
  const [row] = await withColdStartRetry(() =>
    db
      .select({ doc: codexRevisions.doc })
      .from(codexRevisions)
      .where(and(eq(codexRevisions.id, revisionId), eq(codexRevisions.pageId, pageId)))
      .limit(1),
  );
  if (!row) return { ok: false, problems: [`revision ${revisionId} is not part of this page`] };
  const result = parseCodexDoc(row.doc);
  return result.ok ? { ...result, stored: row.doc as CodexStoredDoc } : result;
}

const EMPTY_DOC: CodexDoc = { type: 'doc', attrs: { schemaVersion: 1 }, content: [] };

function composeContent(content: unknown[]): Composed {
  const result = parseCodexDoc({ type: 'doc', attrs: { schemaVersion: 1 }, content });
  return result.ok ? { ...result, stored: result.doc } : result;
}

function editSection(
  base: Extract<Composed, { ok: true }>,
  sectionId: string,
  blocks: readonly unknown[],
  newId: () => string,
): Composed {
  const bounds = sectionBounds(base.doc.content, sectionId);
  if (!bounds) return { ok: false, problems: [`section ${JSON.stringify(sectionId)} is not on this page`] };
  const before = base.doc.content.slice(0, bounds.start);
  const after = base.doc.content.slice(bounds.end);
  const fresh = withFreshIds(blocks, [...before, ...after], newId);
  const composed = composeContent([...before, ...fresh, ...after]);
  if (!composed.ok) return composed;
  const edited = composed.doc.content.slice(bounds.start, bounds.start + fresh.length);
  const kept = base.stored.content;
  return {
    ...composed,
    stored: { ...composed.doc, content: [...kept.slice(0, bounds.start), ...edited, ...kept.slice(bounds.end)] },
  };
}

async function composeDoc(
  pageId: string | null,
  { baseRevisionId, template, edit }: CodexPublishRequest,
  newId: () => string,
): Promise<Composed> {
  if (edit.kind === 'restore') {
    return pageId === null
      ? { ok: false, problems: ['there is no page to restore'] }
      : readRevisionDoc(pageId, edit.revisionId);
  }
  if (edit.kind === 'page') return composeContent(withFreshIds(edit.blocks, [], newId));
  const fresh = template ?? EMPTY_DOC;
  const base =
    pageId === null || baseRevisionId === null
      ? ({ ok: true, doc: fresh, stored: fresh } as const)
      : await readRevisionDoc(pageId, baseRevisionId);
  return base.ok ? editSection(base, edit.sectionId, edit.blocks, newId) : base;
}

async function ensurePage({ kind, key }: CodexSubject, title: string): Promise<string> {
  const [created] = await db
    .insert(codexPages)
    .values({ subjectKind: kind, subjectKey: key, title })
    .onConflictDoNothing({ target: [codexPages.subjectKind, codexPages.subjectKey] })
    .returning({ id: codexPages.id });
  if (created) return created.id;
  const existing = await readCodexPageHead({ kind, key });
  if (!existing) throw new Error(`Codex page ${kind}/${key} vanished while it was being created`);
  return existing.id;
}

async function appendRevisionIfHead(
  pageId: string,
  request: CodexPublishRequest,
  { doc, stored }: Extract<Composed, { ok: true }>,
  revisionId: string,
): Promise<boolean> {
  const restore = request.edit.kind === 'restore' ? request.edit.revisionId : null;
  const result = await db.execute(sql`
    WITH moved AS (
      UPDATE ${codexPages}
      SET current_revision_id = ${revisionId}::uuid, updated_at = now()
      WHERE id = ${pageId}::uuid
        AND current_revision_id IS NOT DISTINCT FROM ${request.baseRevisionId}::uuid
      RETURNING id
    )
    INSERT INTO ${codexRevisions}
      (id, page_id, parent_revision_id, doc, schema_version, user_id, character_id, origin, origin_ref, summary)
    SELECT ${revisionId}::uuid, moved.id, ${request.baseRevisionId}::uuid, ${JSON.stringify(stored)}::jsonb,
      ${doc.attrs.schemaVersion}, ${request.author.userId}, ${request.author.characterId},
      ${restore === null ? 'admin' : 'revert'}, ${restore}, ${request.summary}
    FROM moved
    RETURNING id
  `);
  return (Array.isArray(result) ? result : result.rows).length > 0;
}

export async function publishCodexRevision(
  request: CodexPublishRequest,
  newId: () => string = () => crypto.randomUUID(),
): Promise<CodexPublishResult> {
  const page = await readCodexPageHead(request.subject);
  if ((page?.currentRevisionId ?? null) !== request.baseRevisionId) return CONFLICT;

  const composed = await composeDoc(page?.id ?? null, request, newId);
  if (!composed.ok) return { status: 'invalid', problems: composed.problems };
  let pageId = page?.id;
  if (!pageId) {
    if (!request.title) return { status: 'invalid', problems: ['a new page needs a title'] };
    pageId = await ensurePage(request.subject, request.title);
  }
  const revisionId = newId();
  if (!(await appendRevisionIfHead(pageId, request, composed, revisionId))) return CONFLICT;

  revalidateTag(codexCacheTags.page(request.subject.kind, request.subject.key), { expire: 0 });
  revalidateTag(codexCacheTags.index, { expire: 0 });
  return { status: 'published', revisionId };
}
