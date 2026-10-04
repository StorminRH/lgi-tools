import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { characters } from '@/db/auth-schema';
import { withLockedUsers } from '@/db/locked-user';
import type { AnyPgDb } from '@/lib/db-types';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { parseCodexDoc, type CodexBlockNode, type CodexDoc } from './doc';
import { mergeCodexDocs, proposalDocument, resolveCodexMerge, type CodexChoice, type CodexMerge } from './merge';
import { composeCodexSectionBlocks, publishCodexRevision, type CodexPublishResult, type CodexTemplateSeed } from './publish';
import { readCodexPageHead } from './queries';
import { codexPages, codexProposals, codexRevisions, type CodexProposalStatus } from './schema';
import { resolveCodexSubject, type CodexSubject } from './subjects';

const CODEX_PROPOSAL_LIMITS = { perDay: 10, pendingPerPage: 5 } as const;

const PROPOSAL_TRANSITIONS = { deny: 'denied', withdraw: 'withdrawn' } as const;

export type SubmitOutcome =
  | { readonly status: 'submitted' | 'duplicate'; readonly id: string }
  | { readonly status: 'invalid' | 'daily-limit' | 'page-limit' };

export type ReviewOutcome =
  | 'approved'
  | 'denied'
  | 'withdrawn'
  | 'conflict'
  | 'moved'
  | 'not-pending'
  | 'note-required'
  | 'invalid';

export interface CodexReview {
  readonly headRevisionId: string | null;
  readonly choices: Readonly<Record<string, CodexChoice>>;
}

export interface CodexSubmitter {
  readonly userId: string;
  readonly characterId: number;
}

export interface CodexProposalInput {
  readonly proposalId: string;
  readonly subject: CodexSubject;
  readonly sectionId: string;
  readonly blocks: readonly unknown[];
  readonly summary: string;
  readonly baseRevisionId: string | null;
  readonly submitter: CodexSubmitter;
}

export type CodexSeedLookup = (subject: CodexSubject, baseRevisionId: string | null) => Promise<CodexTemplateSeed>;

async function readQuota(tx: AnyPgDb, input: CodexProposalInput) {
  const { subject, submitter, proposalId } = input;
  const [quota] = await tx
    .select({
      existing: sql<number>`count(*) FILTER (WHERE ${codexProposals.id} = ${proposalId}::uuid)`.mapWith(Number),
      today: sql<number>`count(*) FILTER (WHERE ${codexProposals.createdAt} > now() - interval '1 day')`.mapWith(Number),
      pendingHere: sql<number>`count(*) FILTER (WHERE ${codexProposals.status} = 'pending'
        AND ${codexProposals.subjectKind} = ${subject.kind} AND ${codexProposals.subjectKey} = ${subject.key})`.mapWith(
        Number,
      ),
    })
    .from(codexProposals)
    .where(eq(codexProposals.userId, submitter.userId));
  return quota ?? { existing: 0, today: 0, pendingHere: 0 };
}

async function insertWithinQuota(
  tx: AnyPgDb,
  input: CodexProposalInput,
  title: string,
  section: readonly CodexBlockNode[],
): Promise<SubmitOutcome> {
  const quota = await readQuota(tx, input);
  if (quota.existing > 0) return { status: 'duplicate', id: input.proposalId };
  if (quota.today >= CODEX_PROPOSAL_LIMITS.perDay) return { status: 'daily-limit' };
  if (quota.pendingHere >= CODEX_PROPOSAL_LIMITS.pendingPerPage) return { status: 'page-limit' };

  const inserted = await tx
    .insert(codexProposals)
    .values({
      id: input.proposalId,
      subjectKind: input.subject.kind,
      subjectKey: input.subject.key,
      pageTitle: title,
      baseRevisionId: input.baseRevisionId,
      sectionId: input.sectionId,
      doc: section,
      userId: input.submitter.userId,
      characterId: input.submitter.characterId,
      summary: input.summary,
    })
    .onConflictDoNothing({ target: codexProposals.id })
    .returning({ id: codexProposals.id });
  return { status: inserted.length > 0 ? 'submitted' : 'duplicate', id: input.proposalId };
}

export async function submitCodexProposal(input: CodexProposalInput, seed: CodexTemplateSeed): Promise<SubmitOutcome> {
  const page = await readCodexPageHead(input.subject);
  const template = seed.ok ? seed.template : null;
  const title = page?.title ?? template?.title;
  if (!seed.ok || title === undefined) return { status: 'invalid' };
  const section = await composeCodexSectionBlocks(page?.id ?? null, {
    baseRevisionId: input.baseRevisionId,
    template: template?.doc,
    sectionId: input.sectionId,
    blocks: input.blocks,
  });
  if (!section) return { status: 'invalid' };
  return withColdStartRetry(() => withLockedUsers([input.submitter.userId], (tx) => insertWithinQuota(tx, input, title, section)));
}

async function readProposalStatus(id: string): Promise<CodexProposalStatus | null> {
  const [row] = await db.select({ status: codexProposals.status }).from(codexProposals).where(eq(codexProposals.id, id));
  return row?.status ?? null;
}

export function mergeCodexProposal(
  proposal: Pick<CodexProposalView, 'sectionId' | 'blocks'>,
  base: CodexDoc | null,
  head: CodexDoc | null,
): CodexMerge | { readonly kind: 'invalid'; readonly problems: readonly string[] } {
  if (base === null) return { kind: 'invalid', problems: ['template missing'] };
  const proposed = proposalDocument(base, proposal.sectionId, proposal.blocks);
  if (!proposed) {
    return { kind: 'invalid', problems: [`section ${JSON.stringify(proposal.sectionId)} is not on this page`] };
  }
  return mergeCodexDocs(base, head ?? base, proposed);
}

async function readBaseDoc(baseRevisionId: string | null, seed: CodexTemplateSeed): Promise<CodexDoc | null> {
  if (baseRevisionId !== null) return (await readCodexRevisionDocs([baseRevisionId])).get(baseRevisionId) ?? null;
  const template = seed.ok && seed.template ? parseCodexDoc(seed.template.doc) : null;
  return template?.ok ? template.doc : null;
}

type ProposalRow = typeof codexProposals.$inferSelect;

async function mergedBlocks(
  row: ProposalRow,
  seed: CodexTemplateSeed,
  review: CodexReview,
): Promise<readonly unknown[] | Extract<ReviewOutcome, 'moved' | 'invalid' | 'conflict'>> {
  const headId = review.headRevisionId;
  const head = headId === null ? null : (await readCodexRevisionDocs([headId])).get(headId);
  if (!head) return 'moved';
  const base = await readBaseDoc(row.baseRevisionId, seed);
  const merge = mergeCodexProposal({ sectionId: row.sectionId, blocks: proposalBlocks(row.doc) }, base, head);
  if (merge.kind === 'invalid') return 'invalid';
  return resolveCodexMerge(merge, review.choices) ?? 'conflict';
}

async function outcomeOf(id: string, result: CodexPublishResult): Promise<ReviewOutcome> {
  if (result.status === 'published') return 'approved';
  if (result.status === 'invalid') return 'invalid';
  return (await readProposalStatus(id)) === 'pending' ? 'moved' : 'not-pending';
}

export async function approveCodexProposal(
  id: string,
  seedFor: CodexSeedLookup,
  review: CodexReview,
): Promise<ReviewOutcome> {
  const [row] = await db.select().from(codexProposals).where(eq(codexProposals.id, id));
  if (!row || row.status !== 'pending') return 'not-pending';
  const subject = resolveCodexSubject(row.subjectKind, row.subjectKey);
  if (!subject || !Array.isArray(row.doc)) return 'invalid';
  const seed = await seedFor(subject, row.baseRevisionId);
  if (!seed.ok) return 'invalid';
  const author = { userId: row.userId, characterId: row.characterId };

  if (review.headRevisionId === row.baseRevisionId) {
    const result = await publishCodexRevision({
      subject,
      title: seed.template?.title ?? row.pageTitle,
      baseRevisionId: row.baseRevisionId,
      template: seed.template?.doc,
      edit: { kind: 'section', sectionId: row.sectionId, blocks: row.doc },
      summary: row.summary,
      author,
      proposalId: id,
    });
    return outcomeOf(id, result);
  }
  const blocks = await mergedBlocks(row, seed, review);
  if (typeof blocks === 'string') return blocks;
  const result = await publishCodexRevision({
    subject,
    title: null,
    baseRevisionId: review.headRevisionId,
    edit: { kind: 'page', blocks },
    summary: row.summary,
    author,
    proposalId: id,
  });
  return outcomeOf(id, result);
}

export async function decideCodexProposal(
  id: string,
  action: keyof typeof PROPOSAL_TRANSITIONS,
  { userId, note }: { userId?: string; note?: string | null } = {},
): Promise<ReviewOutcome> {
  const reviewNote = note?.trim() || null;
  if (action === 'deny' && reviewNote === null) return 'note-required';
  const to = PROPOSAL_TRANSITIONS[action];
  const decided = await db
    .update(codexProposals)
    .set({ status: to, reviewNote, decidedAt: sql`now()` })
    .where(
      and(
        eq(codexProposals.id, id),
        eq(codexProposals.status, 'pending'),
        userId === undefined ? undefined : eq(codexProposals.userId, userId),
      ),
    )
    .returning({ id: codexProposals.id });
  return decided.length > 0 ? to : 'not-pending';
}

export async function countPendingCodexProposals(): Promise<number> {
  const [row] = await withColdStartRetry(() =>
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(codexProposals)
      .where(eq(codexProposals.status, 'pending')),
  );
  return row?.count ?? 0;
}

export interface CodexProposalView {
  readonly id: string;
  readonly subject: CodexSubject;
  readonly pageTitle: string;
  readonly sectionId: string;
  readonly baseRevisionId: string | null;
  readonly headRevisionId: string | null;
  readonly blocks: readonly CodexBlockNode[];
  readonly summary: string;
  readonly status: CodexProposalStatus;
  readonly reviewNote: string | null;
  readonly createdAt: Date;
  readonly character: { readonly id: number; readonly name: string };
}

function proposalBlocks(doc: unknown): CodexBlockNode[] {
  const parsed = parseCodexDoc({ type: 'doc', attrs: { schemaVersion: 1 }, content: doc });
  return parsed.ok ? [...parsed.doc.content] : [];
}

async function listProposals(
  where: SQL,
  newestFirst: boolean,
  window?: CodexQueueWindow,
): Promise<CodexProposalView[]> {
  const rows = await withColdStartRetry(() => {
    const query = db
      .select({
        id: codexProposals.id,
        subjectKind: codexProposals.subjectKind,
        subjectKey: codexProposals.subjectKey,
        pageTitle: codexProposals.pageTitle,
        sectionId: codexProposals.sectionId,
        baseRevisionId: codexProposals.baseRevisionId,
        headRevisionId: codexPages.currentRevisionId,
        doc: codexProposals.doc,
        summary: codexProposals.summary,
        status: codexProposals.status,
        reviewNote: codexProposals.reviewNote,
        createdAt: codexProposals.createdAt,
        characterId: codexProposals.characterId,
        characterName: characters.name,
      })
      .from(codexProposals)
      .innerJoin(characters, eq(characters.characterId, codexProposals.characterId))
      .leftJoin(
        codexPages,
        and(eq(codexPages.subjectKind, codexProposals.subjectKind), eq(codexPages.subjectKey, codexProposals.subjectKey)),
      )
      .where(where)
      .orderBy(newestFirst ? desc(codexProposals.createdAt) : asc(codexProposals.createdAt), asc(codexProposals.id))
      .$dynamic();
    return window ? query.limit(window.limit).offset(window.offset) : query;
  });
  return rows.flatMap(({ subjectKind, subjectKey, doc, characterId, characterName, ...row }) => {
    const subject = resolveCodexSubject(subjectKind, subjectKey);
    return subject
      ? [{ ...row, subject, blocks: proposalBlocks(doc), character: { id: characterId, name: characterName } }]
      : [];
  });
}

export interface CodexQueueWindow {
  readonly limit: number;
  readonly offset: number;
}

export function listPendingCodexProposals(window: CodexQueueWindow): Promise<CodexProposalView[]> {
  return listProposals(eq(codexProposals.status, 'pending'), false, window);
}

export function listCodexProposalsBy(userId: string): Promise<CodexProposalView[]> {
  return listProposals(eq(codexProposals.userId, userId), true);
}

export async function readCodexProposal(id: string): Promise<CodexProposalView | null> {
  const [proposal] = await listProposals(eq(codexProposals.id, id), true);
  return proposal ?? null;
}

export async function readCodexRevisionDocs(ids: readonly string[]): Promise<Map<string, CodexDoc>> {
  if (ids.length === 0) return new Map();
  const rows = await withColdStartRetry(() =>
    db
      .select({ id: codexRevisions.id, doc: codexRevisions.doc })
      .from(codexRevisions)
      .where(inArray(codexRevisions.id, [...ids])),
  );
  return new Map(
    rows.flatMap(({ id, doc }) => {
      const parsed = parseCodexDoc(doc);
      return parsed.ok ? [[id, parsed.doc] as const] : [];
    }),
  );
}
