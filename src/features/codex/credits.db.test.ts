import { expect, test, vi } from 'vitest';
import { createDbTestHarness, seedCharacter } from '@/db/__tests__/support/db-test-harness';
import { listCodexCredits } from './queries';
import { codexPages, codexRevisions } from './schema';

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

const harness = await createDbTestHarness({
  schema: 'test_codex_credits',
  tables: ['characters', 'codex_pages', 'codex_revisions'],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

test.skipIf(!harness.reachable)('credits each character once, oldest contributor first', async () => {
  await seedCharacter(harness.db, 9001);
  await seedCharacter(harness.db, 9002);
  const [page] = await harness.db
    .insert(codexPages)
    .values({ subjectKind: 'guides', subjectKey: 'scanning', title: 'Scanning' })
    .returning();
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 12, minute));
  await harness.db.insert(codexRevisions).values(
    ([9002, 9001, 9002, null] as const).map((characterId, index) => ({
      pageId: page!.id,
      doc: {},
      schemaVersion: 1,
      origin: 'admin' as const,
      characterId,
      createdAt: at(index),
    })),
  );

  expect(await listCodexCredits({ kind: 'guides', key: 'scanning' })).toEqual([
    { characterId: 9002, name: 'Character 9002', edits: 2 },
    { characterId: 9001, name: 'Character 9001', edits: 1 },
  ]);
  expect(await listCodexCredits({ kind: 'guides', key: 'other' })).toEqual([]);
});
