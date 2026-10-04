import { asc } from 'drizzle-orm';
import { expect, test, vi } from 'vitest';
import {
  createDbTestHarness,
  seedCharacter,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import { codexPurgeContributor } from './purge';
import { codexPages, codexProposals, codexRevisions } from './schema';

const cache = vi.hoisted(() => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/cache', () => cache);

const harness = await createDbTestHarness({
  schema: 'test_codex_purge',
  tables: ['user', 'characters', 'codex_pages', 'codex_revisions', 'codex_proposals'],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

test.skipIf(!harness.reachable)('purge keeps revision text, drops who wrote it, and deletes their suggestions', async () => {
  await seedUser(harness.db, 'author');
  await seedUser(harness.db, 'other');
  await seedCharacter(harness.db, 9001);
  await seedCharacter(harness.db, 9002);
  const [page] = await harness.db
    .insert(codexPages)
    .values({ subjectKind: 'guides', subjectKey: 'scanning', title: 'Scanning' })
    .returning();
  const revision = (summary: string, userId: string, characterId: number) => ({
    pageId: page!.id,
    doc: {},
    schemaVersion: 1,
    origin: 'admin' as const,
    summary,
    userId,
    characterId,
  });
  await harness.db
    .insert(codexRevisions)
    .values([revision('a', 'author', 9001), revision('b', 'other', 9001), revision('c', 'other', 9002)]);
  const proposal = (summary: string, userId: string, characterId: number) => ({
    id: crypto.randomUUID(),
    subjectKind: 'guides',
    subjectKey: 'scanning',
    pageTitle: 'Scanning',
    sectionId: 'lead',
    doc: [],
    summary,
    userId,
    characterId,
  });
  await harness.db
    .insert(codexProposals)
    .values([proposal('pa', 'author', 9001), proposal('pb', 'other', 9001), proposal('pc', 'other', 9002)]);

  const rows = () =>
    harness.db
      .select({
        summary: codexRevisions.summary,
        userId: codexRevisions.userId,
        characterId: codexRevisions.characterId,
      })
      .from(codexRevisions)
      .orderBy(asc(codexRevisions.summary));
  const suggestions = async () =>
    (await harness.db.select({ summary: codexProposals.summary }).from(codexProposals).orderBy(asc(codexProposals.summary))).map(
      ({ summary }) => summary,
    );

  await codexPurgeContributor.purgeCharacter!({ kind: 'character', userId: 'other', characterId: 9002 });
  expect(cache.revalidateTag.mock.calls).toEqual([
    ['codex:index', { expire: 0 }],
    ['codex:credits', { expire: 0 }],
  ]);
  expect(await rows()).toEqual([
    { summary: 'a', userId: 'author', characterId: 9001 },
    { summary: 'b', userId: 'other', characterId: 9001 },
    { summary: 'c', userId: 'other', characterId: null },
  ]);
  expect(await suggestions()).toEqual(['pa', 'pb']);

  cache.revalidateTag.mockClear();
  await codexPurgeContributor.purgeUser!({ kind: 'user', userId: 'author' });
  expect(cache.revalidateTag.mock.calls).toEqual([
    ['codex:index', { expire: 0 }],
    ['codex:credits', { expire: 0 }],
  ]);
  expect(await rows()).toEqual([
    { summary: 'a', userId: null, characterId: null },
    { summary: 'b', userId: 'other', characterId: 9001 },
    { summary: 'c', userId: 'other', characterId: null },
  ]);
  expect(await suggestions()).toEqual(['pb']);
});
