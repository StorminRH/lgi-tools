import { eq } from 'drizzle-orm';
import { expect, test, vi } from 'vitest';
import { createDbTestHarness, seedCharacter } from '@/db/__tests__/support/db-test-harness';
import { codexPages, codexRevisions } from './schema';

const cache = vi.hoisted(() => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock('next/cache', () => cache);

import { listCodexPages, listCodexRevisions, loadCodexPage } from './queries';

const harness = await createDbTestHarness({
  schema: 'test_codex_queries',
  tables: ['characters', 'codex_pages', 'codex_revisions'],
  foreignKeys: [
    { table: 'codex_revisions', column: 'page_id', refTable: 'codex_pages', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

const docWith = (text: string) => ({
  type: 'doc',
  attrs: { schemaVersion: 1 },
  content: [{ type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text }] }],
});

test.skipIf(!harness.reachable)('reads the current revision of a guide and rejects a corrupt one', async () => {
  const [page] = await harness.db
    .insert(codexPages)
    .values({ subjectKind: 'guides', subjectKey: 'rolling-a-c3', title: 'Rolling a C3 static' })
    .returning();
  const [first] = await harness.db
    .insert(codexRevisions)
    .values({ pageId: page!.id, doc: docWith('First draft'), schemaVersion: 1, origin: 'admin' })
    .returning();
  const [second] = await harness.db
    .insert(codexRevisions)
    .values({
      pageId: page!.id,
      parentRevisionId: first!.id,
      doc: docWith('Second draft'),
      schemaVersion: 1,
      origin: 'admin',
    })
    .returning();

  expect(await loadCodexPage({ kind: 'guides', key: 'rolling-a-c3' })).toBeNull();
  expect(await listCodexPages('guides')).toEqual([]);

  await harness.db
    .update(codexPages)
    .set({ currentRevisionId: second!.id })
    .where(eq(codexPages.id, page!.id));

  const loaded = await loadCodexPage({ kind: 'guides', key: 'rolling-a-c3' });
  expect(loaded?.title).toBe('Rolling a C3 static');
  expect(loaded?.doc.content).toEqual([
    {
      type: 'paragraph',
      attrs: { id: 'p1' },
      content: [{ type: 'text', text: 'Second draft', marks: [] }],
    },
  ]);
  expect(cache.cacheTag).toHaveBeenCalledWith('codex:page:guides:rolling-a-c3');
  expect(await loadCodexPage({ kind: 'guides', key: 'missing' })).toBeNull();
  expect(await listCodexPages('guides')).toEqual([
    { key: 'rolling-a-c3', title: 'Rolling a C3 static', updatedAt: page!.updatedAt },
  ]);

  const [corrupt] = await harness.db
    .insert(codexRevisions)
    .values({
      pageId: page!.id,
      parentRevisionId: second!.id,
      doc: { type: 'doc', attrs: { schemaVersion: 1 }, content: [{ type: 'script' }] },
      schemaVersion: 1,
      origin: 'admin',
    })
    .returning();
  await harness.db
    .update(codexPages)
    .set({ currentRevisionId: corrupt!.id })
    .where(eq(codexPages.id, page!.id));

  await expect(loadCodexPage({ kind: 'guides', key: 'rolling-a-c3' })).rejects.toThrow(
    `Codex revision ${corrupt!.id} of guides/rolling-a-c3 failed to parse: content.0.type: node type "script" is not allowed here`,
  );
});

test.skipIf(!harness.reachable)('lists a page history newest first with its author and the current mark', async () => {
  expect(await listCodexRevisions({ kind: 'guides', key: 'rolling-a-c3' })).toBeNull();

  await seedCharacter(harness.db, 90_000_001, { name: 'Stormin Pilot' });
  const [page] = await harness.db
    .insert(codexPages)
    .values({ subjectKind: 'guides', subjectKey: 'rolling-a-c3', title: 'Rolling a C3 static' })
    .returning();
  const [first] = await harness.db
    .insert(codexRevisions)
    .values({
      pageId: page!.id,
      doc: docWith('First draft'),
      schemaVersion: 1,
      origin: 'admin',
      characterId: 90_000_001,
      summary: 'First draft',
      createdAt: new Date('2026-10-01T10:00:00Z'),
    })
    .returning();
  const [second] = await harness.db
    .insert(codexRevisions)
    .values({
      pageId: page!.id,
      parentRevisionId: first!.id,
      doc: docWith('First draft'),
      schemaVersion: 1,
      origin: 'revert',
      originRef: first!.id,
      createdAt: new Date('2026-10-02T10:00:00Z'),
    })
    .returning();
  await harness.db.update(codexPages).set({ currentRevisionId: second!.id }).where(eq(codexPages.id, page!.id));

  expect(await listCodexRevisions({ kind: 'guides', key: 'rolling-a-c3' })).toEqual({
    title: 'Rolling a C3 static',
    revisions: [
      {
        id: second!.id,
        createdAt: new Date('2026-10-02T10:00:00Z'),
        origin: 'revert',
        summary: null,
        character: null,
        current: true,
      },
      {
        id: first!.id,
        createdAt: new Date('2026-10-01T10:00:00Z'),
        origin: 'admin',
        summary: 'First draft',
        character: { id: 90_000_001, name: 'Stormin Pilot' },
        current: false,
      },
    ],
  });
});
