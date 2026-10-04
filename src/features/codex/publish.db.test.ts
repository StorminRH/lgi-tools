import { asc, eq } from 'drizzle-orm';
import { expect, test, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { codexPages, codexRevisions } from './schema';

const cache = vi.hoisted(() => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/cache', () => cache);

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

import { publishCodexRevision, type CodexEdit, type CodexPublishRequest } from './publish';

const harness = await createDbTestHarness({
  schema: 'test_codex_publish',
  tables: ['codex_pages', 'codex_revisions'],
  foreignKeys: [
    { table: 'codex_revisions', column: 'page_id', refTable: 'codex_pages', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

const subject = { kind: 'guides', key: 'rolling-a-c3' } as const;
const author = { userId: 'user-admin', characterId: null };

const paragraph = (id: string | undefined, text: string) => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
});
const heading = (id: string, text: string) => ({
  type: 'heading',
  attrs: { id, level: 2 },
  content: [{ type: 'text', text }],
});

function request(baseRevisionId: string | null, edit: CodexEdit, extra: Partial<CodexPublishRequest> = {}) {
  return { subject, title: null, baseRevisionId, edit, summary: null, author, ...extra };
}

const PASTED_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

function sequence(...ids: string[]) {
  return () => ids.shift() ?? crypto.randomUUID();
}

let counter = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

async function createGuide() {
  const created = await publishCodexRevision(
    request(
      null,
      {
        kind: 'page',
        blocks: [paragraph('lead', 'Start here.'), heading('ships', 'Ships'), paragraph('ships-1', 'Bring a Gila.')],
      },
      { title: 'Rolling a C3 static', summary: 'First draft' },
    ),
  );
  if (created.status !== 'published') throw new Error(`setup publish was ${created.status}`);
  return created.revisionId;
}

async function storedRevisions() {
  return harness.db
    .select({
      id: codexRevisions.id,
      parent: codexRevisions.parentRevisionId,
      origin: codexRevisions.origin,
      originRef: codexRevisions.originRef,
      summary: codexRevisions.summary,
      doc: codexRevisions.doc,
    })
    .from(codexRevisions)
    .orderBy(asc(codexRevisions.createdAt));
}

async function head() {
  const [page] = await harness.db.select().from(codexPages).where(eq(codexPages.subjectKey, subject.key));
  return page;
}

const contentOf = (doc: unknown) => (doc as { content: unknown[] }).content;

test.skipIf(!harness.reachable)('creates the page on first publish and edits one section on the head', async () => {
  const first = await createGuide();
  expect(await head()).toMatchObject({ title: 'Rolling a C3 static', currentRevisionId: first });
  expect(cache.revalidateTag).toHaveBeenCalledWith('codex:page:guides:rolling-a-c3', { expire: 0 });
  expect(cache.revalidateTag).toHaveBeenCalledWith('codex:index', { expire: 0 });

  const edited = await publishCodexRevision(
    request(
      first,
      { kind: 'section', sectionId: 'ships', blocks: [paragraph('ships-1', 'Bring two Gilas.'), paragraph('lead', 'Pasted.')] },
      { summary: 'Two Gilas' },
    ),
    sequence(PASTED_ID, 'aaaaaaaa-0000-4000-8000-000000000002'),
  );

  expect(edited.status).toBe('published');
  const revisions = await storedRevisions();
  expect(revisions.map(({ parent, origin, summary }) => ({ parent, origin, summary }))).toEqual([
    { parent: null, origin: 'admin', summary: 'First draft' },
    { parent: first, origin: 'admin', summary: 'Two Gilas' },
  ]);
  expect(contentOf(revisions[1]!.doc)).toEqual([
    { type: 'paragraph', attrs: { id: 'lead' }, content: [{ type: 'text', text: 'Start here.', marks: [] }] },
    { type: 'heading', attrs: { id: 'ships', level: 2 }, content: [{ type: 'text', text: 'Ships', marks: [] }] },
    { type: 'paragraph', attrs: { id: 'ships-1' }, content: [{ type: 'text', text: 'Bring two Gilas.', marks: [] }] },
    { type: 'paragraph', attrs: { id: PASTED_ID }, content: [{ type: 'text', text: 'Pasted.', marks: [] }] },
  ]);
  expect((await head())?.currentRevisionId).toBe(edited.status === 'published' ? edited.revisionId : null);
});

test.skipIf(!harness.reachable)('re-keys a nested block id that already lives in another section', async () => {
  const first = await createGuide();
  const nested = {
    type: 'callout',
    attrs: { id: 'tip', tone: 'tip' },
    content: [paragraph('ships-1', 'Moved from Ships.'), paragraph('tip-1', 'Mine.')],
  };

  const edited = await publishCodexRevision(
    request(first, { kind: 'section', sectionId: 'lead', blocks: [paragraph('lead', 'Start here.'), nested] }),
    sequence(PASTED_ID),
  );

  expect(edited.status).toBe('published');
  const revisions = await storedRevisions();
  expect(contentOf(revisions[1]!.doc)).toEqual([
    { type: 'paragraph', attrs: { id: 'lead' }, content: [{ type: 'text', text: 'Start here.', marks: [] }] },
    {
      type: 'callout',
      attrs: { id: 'tip', tone: 'tip' },
      content: [
        { type: 'paragraph', attrs: { id: PASTED_ID }, content: [{ type: 'text', text: 'Moved from Ships.', marks: [] }] },
        { type: 'paragraph', attrs: { id: 'tip-1' }, content: [{ type: 'text', text: 'Mine.', marks: [] }] },
      ],
    },
    { type: 'heading', attrs: { id: 'ships', level: 2 }, content: [{ type: 'text', text: 'Ships', marks: [] }] },
    { type: 'paragraph', attrs: { id: 'ships-1' }, content: [{ type: 'text', text: 'Bring a Gila.', marks: [] }] },
  ]);
});

test.skipIf(!harness.reachable)('refuses a stale base and leaves the head and history alone', async () => {
  const first = await createGuide();
  const second = await publishCodexRevision(
    request(first, { kind: 'section', sectionId: 'lead', blocks: [paragraph('lead', 'Newer.')] }),
  );
  expect(second.status).toBe('published');

  expect(
    await publishCodexRevision(
      request(first, { kind: 'section', sectionId: 'lead', blocks: [paragraph('lead', 'Stale.')] }),
    ),
  ).toEqual({ status: 'conflict' });
  expect(
    await publishCodexRevision(request(null, { kind: 'page', blocks: [] }, { title: 'Again' })),
  ).toEqual({ status: 'conflict' });
  expect(await storedRevisions()).toHaveLength(2);
});

test.skipIf(!harness.reachable)('reports invalid edits without writing', async () => {
  expect(
    await publishCodexRevision(request(null, { kind: 'page', blocks: [paragraph('a', 'x')] })),
  ).toEqual({ status: 'invalid', problems: ['a new page needs a title'] });
  expect(await harness.db.select().from(codexPages)).toEqual([]);

  const first = await createGuide();
  expect(
    await publishCodexRevision(
      request(first, { kind: 'section', sectionId: 'loot', blocks: [paragraph('x', 'x')] }),
    ),
  ).toEqual({ status: 'invalid', problems: ['section "loot" is not on this page'] });
  expect(
    await publishCodexRevision(
      request(first, { kind: 'section', sectionId: 'lead', blocks: [{ type: 'script', attrs: {} }] }),
    ),
  ).toEqual({ status: 'invalid', problems: ['content.0.type: node type "script" is not allowed here'] });
  expect(await storedRevisions()).toHaveLength(1);
});

test.skipIf(!harness.reachable)('restores an earlier revision as a revert on the head', async () => {
  const first = await createGuide();
  const second = await publishCodexRevision(
    request(first, { kind: 'section', sectionId: 'lead', blocks: [paragraph('lead', 'Vandalised.')] }),
  );
  if (second.status !== 'published') throw new Error('edit failed');

  expect(await publishCodexRevision(request(first, { kind: 'restore', revisionId: first }))).toEqual({
    status: 'conflict',
  });
  const restored = await publishCodexRevision(
    request(second.revisionId, { kind: 'restore', revisionId: first }, { summary: 'Restore' }),
  );

  expect(restored.status).toBe('published');
  const revisions = await storedRevisions();
  expect(revisions.map(({ origin, originRef, parent }) => ({ origin, originRef, parent }))).toEqual([
    { origin: 'admin', originRef: null, parent: null },
    { origin: 'admin', originRef: null, parent: first },
    { origin: 'revert', originRef: first, parent: second.revisionId },
  ]);
  expect(revisions[2]!.doc).toEqual(revisions[0]!.doc);
  expect((await head())?.currentRevisionId).toBe(revisions[2]!.id);
});

test.skipIf(!harness.reachable)('lets exactly one of two publishes on the same base win', async () => {
  const first = await createGuide();
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
  const results = await Promise.all(
    ['Tab one.', 'Tab two.'].map((text) =>
      publishCodexRevision(
        request(first, { kind: 'section', sectionId: 'lead', blocks: [paragraph('lead', text)] }),
        nextId,
      ),
    ),
  );

  headRead.hold = null;

  expect(arrived).toBe(2);
  expect(results.map((result) => result.status).sort()).toEqual(['conflict', 'published']);
  const winner = results.find((result) => result.status === 'published');
  expect(await storedRevisions()).toHaveLength(2);
  expect((await head())?.currentRevisionId).toBe(winner?.status === 'published' ? winner.revisionId : null);
});

test.skipIf(!harness.reachable)('keeps the untouched blocks exactly as they were stored', async () => {
  const lead = {
    type: 'paragraph',
    attrs: { id: 'lead' },
    content: [{ type: 'text', text: 'Mass', marks: [{ type: 'code' }] }],
  };
  const table = {
    type: 'table',
    attrs: { id: 'mass' },
    content: [
      {
        type: 'tableRow',
        content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '200 t' }] }] }],
      },
    ],
  };
  const doc = {
    type: 'doc',
    attrs: { schemaVersion: 1 },
    content: [lead, heading('ships', 'Ships'), paragraph('ships-1', 'Old.'), heading('mass-h', 'Mass'), table],
  };
  const [page] = await harness.db
    .insert(codexPages)
    .values({ subjectKind: subject.kind, subjectKey: subject.key, title: 'Rolling a C3 static' })
    .returning();
  const [seeded] = await harness.db
    .insert(codexRevisions)
    .values({ pageId: page!.id, doc, schemaVersion: 1, origin: 'admin' })
    .returning({ id: codexRevisions.id });
  await harness.db.update(codexPages).set({ currentRevisionId: seeded!.id }).where(eq(codexPages.id, page!.id));

  const edited = await publishCodexRevision(
    request(seeded!.id, { kind: 'section', sectionId: 'ships', blocks: [paragraph('ships-1', 'New.')] }),
  );

  expect(edited.status).toBe('published');
  expect(contentOf((await storedRevisions()).at(-1)!.doc)).toEqual([
    lead,
    heading('ships', 'Ships'),
    { type: 'paragraph', attrs: { id: 'ships-1' }, content: [{ type: 'text', text: 'New.', marks: [] }] },
    heading('mass-h', 'Mass'),
    table,
  ]);
});
