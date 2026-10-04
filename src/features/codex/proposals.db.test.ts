import { asc, eq, sql } from 'drizzle-orm';
import { beforeEach, expect, test, vi } from 'vitest';
import { createDbTestHarness, seedCharacter, seedUser } from '@/db/__tests__/support/db-test-harness';
import type { CodexDoc } from './doc';
import { codexPages, codexProposals, codexRevisions } from './schema';

const cache = vi.hoisted(() => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/cache', () => cache);

// Production's request db is Neon HTTP, which has no transactions.
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>();
  const db = new Proxy(actual.db, {
    get: (target, prop) =>
      prop === 'transaction'
        ? () => Promise.reject(new Error('No transactions support in neon-http driver'))
        : Reflect.get(target, prop),
  });
  return { ...actual, db };
});

const headRead = vi.hoisted(() => ({ hold: null as null | (() => Promise<void>) }));
vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    readCodexPageHead: async (...args: Parameters<typeof actual.readCodexPageHead>) => {
      const page = await actual.readCodexPageHead(...args);
      await headRead.hold?.();
      return page;
    },
  };
});

import {
  approveCodexProposal,
  countPendingCodexProposals,
  decideCodexProposal,
  listPendingCodexProposals,
  submitCodexProposal,
  type CodexProposalInput,
} from './proposals';
import { directClient } from '@/db';
import { publishCodexRevision } from './publish';
import { listCodexCredits } from './queries';

const harness = await createDbTestHarness({
  schema: 'test_codex_proposals',
  tables: ['user', 'characters', 'codex_pages', 'codex_revisions', 'codex_proposals'],
  foreignKeys: [
    { table: 'codex_revisions', column: 'page_id', refTable: 'codex_pages', refColumn: 'id', onDelete: 'cascade' },
    { table: 'codex_proposals', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

const guide = { kind: 'guides', key: 'rolling-a-c3' } as const;
const P1 = '11111111-1111-4111-8111-111111111111';
const u1 = { userId: 'u1', characterId: 9001 };
const u2 = { userId: 'u2', characterId: 9002 };

const paragraph = (id: string, text: string) => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] });
const heading = (id: string, text: string) => ({
  type: 'heading',
  attrs: { id, level: 2 },
  content: [{ type: 'text', text }],
});

const noTemplate = { ok: true, template: null } as const;
const seedNone = async () => noTemplate;

const c247Template: CodexDoc = {
  type: 'doc',
  attrs: { schemaVersion: 1 },
  content: [
    { type: 'heading', attrs: { id: 'overview', level: 2 }, content: [{ type: 'text', text: 'Overview', marks: [] }] },
    { type: 'paragraph', attrs: { id: 'blank' }, content: [] },
  ],
};
const templateSeed = { ok: true, template: { title: 'C247', doc: c247Template } } as const;

let R1 = '';

beforeEach(async () => {
  if (!harness.reachable) return;
  await seedUser(harness.db, 'admin');
  await seedUser(harness.db, 'u1');
  await seedUser(harness.db, 'u2');
  await seedCharacter(harness.db, 9001, { name: 'Tester' });
  await seedCharacter(harness.db, 9002);
  const created = await publishCodexRevision({
    subject: guide,
    title: 'Rolling a C3 static',
    baseRevisionId: null,
    edit: { kind: 'page', blocks: [paragraph('lead', 'Start here.'), heading('strategy', 'Strategy'), paragraph('s1', 'Warp in at 30 km.')] },
    summary: 'First draft',
    author: { userId: 'admin', characterId: null },
  });
  if (created.status !== 'published') throw new Error('setup publish failed');
  R1 = created.revisionId;
});

function suggestion(over: Partial<CodexProposalInput> = {}): CodexProposalInput {
  return {
    proposalId: P1,
    subject: guide,
    sectionId: 'strategy',
    blocks: [paragraph('s1', 'Warp in at 50 km.')],
    summary: 'Fix range',
    baseRevisionId: R1,
    submitter: u1,
    ...over,
  };
}

const proposal = async (id = P1) => (await harness.db.select().from(codexProposals).where(eq(codexProposals.id, id)))[0];
const head = async (key = guide.key) =>
  (await harness.db.select().from(codexPages).where(eq(codexPages.subjectKey, key)))[0];
const revisions = () => harness.db.select().from(codexRevisions).orderBy(asc(codexRevisions.createdAt));

test.skipIf(!harness.reachable)('a submitted suggestion is stored once and a replay is a duplicate', async () => {
  expect(await submitCodexProposal(suggestion(), noTemplate)).toEqual({ status: 'submitted', id: P1 });
  expect(await proposal()).toMatchObject({ status: 'pending', pageTitle: 'Rolling a C3 static', baseRevisionId: R1 });
  expect(await submitCodexProposal(suggestion(), noTemplate)).toEqual({ status: 'duplicate', id: P1 });
  expect(await harness.db.select().from(codexProposals)).toHaveLength(1);
});

test.skipIf(!harness.reachable)('approving publishes the suggestion as the submitter and credits them', async () => {
  await submitCodexProposal(suggestion(), noTemplate);
  expect(await approveCodexProposal(P1, seedNone)).toBe('approved');

  const page = await head();
  const [, published] = await revisions();
  expect(published).toMatchObject({
    id: page!.currentRevisionId,
    origin: 'proposal',
    originRef: P1,
    userId: 'u1',
    characterId: 9001,
    parentRevisionId: R1,
    summary: 'Fix range',
  });
  expect(JSON.stringify(published!.doc)).toContain('Warp in at 50 km.');
  const approved = await proposal();
  expect(approved).toMatchObject({ status: 'approved', resultRevisionId: page!.currentRevisionId });
  expect(approved!.decidedAt).toBeInstanceOf(Date);
  expect(await listCodexCredits(guide)).toEqual([{ characterId: 9001, name: 'Tester', edits: 1 }]);

  expect(await approveCodexProposal(P1, seedNone)).toBe('not-pending');
  expect(await revisions()).toHaveLength(2);
});

test.skipIf(!harness.reachable)('a denial needs a note', async () => {
  await submitCodexProposal(suggestion(), noTemplate);
  expect(await decideCodexProposal(P1, 'deny', { note: '  ' })).toBe('note-required');
  expect((await proposal())!.status).toBe('pending');
  expect(await decideCodexProposal(P1, 'deny', { note: 'Wrong wave' })).toBe('denied');
  expect(await proposal()).toMatchObject({ status: 'denied', reviewNote: 'Wrong wave' });
});

test.skipIf(!harness.reachable)('only the submitter withdraws, and only while pending', async () => {
  await submitCodexProposal(suggestion(), noTemplate);
  expect(await decideCodexProposal(P1, 'withdraw', { userId: 'u2' })).toBe('not-pending');
  expect((await proposal())!.status).toBe('pending');
  expect(await decideCodexProposal(P1, 'withdraw', { userId: 'u1' })).toBe('withdrawn');

  const P2 = '22222222-2222-4222-8222-222222222222';
  await submitCodexProposal(suggestion({ proposalId: P2 }), noTemplate);
  await decideCodexProposal(P2, 'deny', { note: 'No' });
  expect(await decideCodexProposal(P2, 'withdraw', { userId: 'u1' })).toBe('not-pending');
});

test.skipIf(!harness.reachable)('a suggestion against a page that moved needs a merge and stays pending', async () => {
  await submitCodexProposal(suggestion(), noTemplate);
  const R2 = await publishCodexRevision({
    subject: guide,
    title: null,
    baseRevisionId: R1,
    edit: { kind: 'section', sectionId: 'lead', blocks: [paragraph('lead', 'Start over here.')] },
    summary: null,
    author: { userId: 'admin', characterId: null },
  });
  expect(await approveCodexProposal(P1, seedNone)).toBe('needs-merge');
  expect((await proposal())!.status).toBe('pending');
  expect((await head())!.currentRevisionId).toBe(R2.status === 'published' ? R2.revisionId : null);
});

test.skipIf(!harness.reachable)('a suggestion on an unwritten entity page creates it from the template', async () => {
  const c247 = { kind: 'wormholes', key: 'c247' } as const;
  const outcome = await submitCodexProposal(
    suggestion({ subject: c247, sectionId: 'overview', baseRevisionId: null, blocks: [paragraph('o1', 'Big.')] }),
    templateSeed,
  );
  expect(outcome).toEqual({ status: 'submitted', id: P1 });
  expect(await approveCodexProposal(P1, async () => templateSeed)).toBe('approved');
  const pages = await harness.db.select().from(codexPages).where(eq(codexPages.subjectKind, 'wormholes'));
  expect(pages.map(({ title }) => title)).toEqual(['C247']);
  const [created] = await harness.db
    .select()
    .from(codexRevisions)
    .where(eq(codexRevisions.id, pages[0]!.currentRevisionId!));
  expect(created!.parentRevisionId).toBeNull();
});

test.skipIf(!harness.reachable)('submissions are capped per day and per page', async () => {
  const wormhole = (index: number) => ({ kind: 'wormholes', key: `c${100 + index}` }) as const;
  const submitTo = (index: number, submitter = u1) =>
    submitCodexProposal(
      suggestion({
        proposalId: crypto.randomUUID(),
        subject: wormhole(index),
        sectionId: 'overview',
        baseRevisionId: null,
        submitter,
      }),
      templateSeed,
    );
  for (let index = 0; index < 10; index += 1) {
    expect((await submitTo(index)).status).toBe('submitted');
  }
  expect(await submitTo(10)).toEqual({ status: 'daily-limit' });
  await harness.db.execute(sql`UPDATE codex_proposals SET created_at = now() - interval '25 hours'`);
  expect((await submitTo(10)).status).toBe('submitted');

  const onOnePage = () => submitTo(20, u2);
  const pending = [];
  for (let count = 0; count < 5; count += 1) pending.push(await onOnePage());
  expect(pending.map(({ status }) => status)).toEqual(Array(5).fill('submitted'));
  expect(await onOnePage()).toEqual({ status: 'page-limit' });
  expect((await submitTo(21, u2)).status).toBe('submitted');
  const first = pending[0]!;
  await decideCodexProposal('id' in first ? first.id : '', 'withdraw', { userId: 'u2' });
  expect((await onOnePage()).status).toBe('submitted');
});

test.skipIf(!harness.reachable)('submissions racing for the last daily slots stop at the cap', async () => {
  const submitTo = (index: number) =>
    submitCodexProposal(
      suggestion({
        proposalId: crypto.randomUUID(),
        subject: { kind: 'wormholes', key: `c${100 + index}` },
        sectionId: 'overview',
        baseRevisionId: null,
      }),
      templateSeed,
    );
  for (let index = 0; index < 8; index += 1) await submitTo(index);
  const racers = 6;
  let arrived = 0;
  let releaseAll = () => {};
  const allRead = new Promise<void>((resolve) => {
    releaseAll = resolve;
  });
  headRead.hold = () => {
    arrived += 1;
    if (arrived === racers) releaseAll();
    return allRead;
  };
  // Open every direct connection first, or one warm connection serializes the racers.
  await Promise.all(Array.from({ length: 3 }, () => directClient.unsafe('select pg_sleep(0.05)')));
  const outcomes = await Promise.all(Array.from({ length: racers }, (_, index) => submitTo(8 + index)));
  headRead.hold = null;

  expect(outcomes.map(({ status }) => status).sort()).toEqual([
    'daily-limit',
    'daily-limit',
    'daily-limit',
    'daily-limit',
    'submitted',
    'submitted',
  ]);
  expect(await harness.db.select().from(codexProposals)).toHaveLength(10);
});

test.skipIf(!harness.reachable)('the pending queue reads one window at a time, oldest first', async () => {
  const ids = ['a', 'b', 'c'].map((letter) => `${letter.repeat(8)}-0000-4000-8000-000000000000`);
  for (const [index, proposalId] of ids.entries()) {
    await submitCodexProposal(
      suggestion({ proposalId, subject: { kind: 'wormholes', key: `c${100 + index}` }, sectionId: 'overview', baseRevisionId: null }),
      templateSeed,
    );
  }
  await harness.db.execute(sql`UPDATE codex_proposals SET created_at = '2026-10-01T00:00:00Z'`);
  expect((await listPendingCodexProposals({ limit: 2, offset: 1 })).map(({ id }) => id)).toEqual(ids.slice(1));
});

test.skipIf(!harness.reachable)('a section that is not on the page is refused and the queue counts pending only', async () => {
  expect(await submitCodexProposal(suggestion({ sectionId: 'nope' }), noTemplate)).toEqual({ status: 'invalid' });
  expect(await harness.db.select().from(codexProposals)).toHaveLength(0);
  await submitCodexProposal(suggestion(), noTemplate);
  expect(await countPendingCodexProposals()).toBe(1);
  await decideCodexProposal(P1, 'withdraw', { userId: 'u1' });
  expect(await countPendingCodexProposals()).toBe(0);
});

test.skipIf(!harness.reachable)('two reviewers approving at once publish exactly one revision', async () => {
  await submitCodexProposal(suggestion(), noTemplate);
  let arrived = 0;
  let releaseBoth = () => {};
  const bothRead = new Promise<void>((resolve) => {
    releaseBoth = resolve;
  });
  headRead.hold = () => {
    arrived += 1;
    if (arrived === 2) releaseBoth();
    return bothRead;
  };
  const outcomes = await Promise.all([approveCodexProposal(P1, seedNone), approveCodexProposal(P1, seedNone)]);
  headRead.hold = null;

  expect(arrived).toBe(2);
  expect(outcomes.filter((outcome) => outcome === 'approved')).toHaveLength(1);
  expect(await revisions()).toHaveLength(2);
});

test.skipIf(!harness.reachable)('an approval racing a withdrawal publishes nothing', async () => {
  await submitCodexProposal(suggestion(), noTemplate);
  const withdrawer = await harness.sql.reserve();
  try {
    await withdrawer`BEGIN`;
    await withdrawer`SET LOCAL idle_in_transaction_session_timeout = '10s'`;
    await withdrawer`UPDATE codex_proposals SET status = 'withdrawn', decided_at = now() WHERE id = ${P1}`;
    const [holder] = await withdrawer<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    const approval = approveCodexProposal(P1, seedNone);
    await expect
      .poll(
        async () => {
          const [row] = await harness.sql<{ count: number }[]>`
            SELECT count(*)::integer AS count FROM pg_stat_activity
            WHERE ${holder!.pid} = ANY(pg_blocking_pids(pid))
          `;
          return row?.count;
        },
        { timeout: 3_000, interval: 20 },
      )
      .toBe(1);
    await withdrawer`COMMIT`;
    expect(await approval).toBe('not-pending');
  } finally {
    withdrawer.release();
  }
  expect(await proposal()).toMatchObject({ status: 'withdrawn', resultRevisionId: null });
  expect((await head())!.currentRevisionId).toBe(R1);
  expect((await revisions()).map(({ origin }) => origin)).toEqual(['admin']);
});

test.skipIf(!harness.reachable)('the database refuses a denial without a note and a second revision for one proposal', async () => {
  await submitCodexProposal(suggestion(), noTemplate);
  await expect(
    harness.db.execute(sql`UPDATE codex_proposals SET status = 'denied', decided_at = now() WHERE id = ${P1}`),
  ).rejects.toMatchObject({ cause: { code: '23514', constraint_name: 'codex_proposals_denied_has_note' } });
  await approveCodexProposal(P1, seedNone);
  const page = await head();
  await expect(
    harness.db.insert(codexRevisions).values({
      pageId: page!.id,
      doc: {},
      schemaVersion: 1,
      origin: 'proposal',
      originRef: P1,
    }),
  ).rejects.toMatchObject({ cause: { code: '23505' } });
});
