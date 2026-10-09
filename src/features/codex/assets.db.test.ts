import { createHash } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { beforeEach, expect, test, vi } from 'vitest';
import { createDbTestHarness, seedCharacter, seedUser } from '@/db/__tests__/support/db-test-harness';
import type { CodexBlobPort } from '@/lib/codex-blob';
import { codexAssets, codexProposals } from './schema';

const cache = vi.hoisted(() => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/cache', () => cache);

import { finalizeCodexUpload, pruneExpiredCodexAssets, sweepOrphanPendingBlobs } from './asset-storage';
import { codexAssetProblems, loadCodexAssetViews, loadCodexPageAssets, withImageSources } from './assets';
import { approveCodexProposal, submitCodexProposal } from './proposals';
import { publishCodexRevision } from './publish';
import { codexPurgeContributor } from './purge';

const harness = await createDbTestHarness({
  schema: 'test_codex_assets',
  tables: ['user', 'characters', 'codex_pages', 'codex_revisions', 'codex_proposals', 'codex_assets'],
  foreignKeys: [
    { table: 'codex_revisions', column: 'page_id', refTable: 'codex_pages', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

const STORE = 'store1.public.blob.vercel-storage.com';
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'aaaaaaaa-0000-4000-8000-000000000002';
const P = 'aaaaaaaa-0000-4000-8000-000000000003';
const R = 'aaaaaaaa-0000-4000-8000-000000000004';
const MISSING = 'aaaaaaaa-0000-4000-8000-0000000000ff';
const guide = { kind: 'guides', key: 'rolling-a-c3' } as const;
const DAY = 24 * 60 * 60 * 1000;

const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWM4oaEBRww4OQAHpg0heFEebgAAAABJRU5ErkJggg==',
  'base64',
);

const variantsFor = (id: string) => ({
  '640': `https://${STORE}/codex/local/img/${id}-640.webp`,
  '1280': `https://${STORE}/codex/local/img/${id}-1280.webp`,
  '1920': `https://${STORE}/codex/local/img/${id}-1920.webp`,
});

interface AssetSeed {
  id: string;
  sha?: string;
  uploader?: string | null;
  characterId?: number | null;
  status?: 'pending' | 'published' | 'removed';
  createdAt?: Date;
}

async function seedAsset({ id, sha = id, uploader = 'u1', characterId = 9001, status = 'pending', createdAt }: AssetSeed) {
  await harness.db.insert(codexAssets).values({
    id,
    sha256: sha,
    width: 1920,
    height: 1080,
    variants: variantsFor(id),
    userId: uploader,
    characterId,
    status,
    publishedAt: status === 'published' ? new Date() : null,
    ...(createdAt ? { createdAt } : {}),
  });
}

const image = (id: string, assetId: string, alt = 'Gila holding') => ({
  type: 'image',
  attrs: { id, assetId, alt, caption: '' },
});

async function statuses() {
  const rows = await harness.db
    .select({ id: codexAssets.id, status: codexAssets.status, uploader: codexAssets.userId })
    .from(codexAssets)
    .orderBy(asc(codexAssets.id));
  return Object.fromEntries(rows.map((row) => [row.id, row.status]));
}

function stubPort(overrides: Partial<CodexBlobPort> = {}) {
  const removed: string[][] = [];
  const port: CodexBlobPort = {
    download: async () => ({ ok: true, bytes: new Uint8Array(RED_PNG) }),
    putVariant: async (key) => `https://${STORE}/${key}`,
    remove: async (urls) => {
      removed.push([...urls]);
    },
    listPending: async function* () {},
    ...overrides,
  };
  return { port, removed };
}

const pendingUrl = (userId: string, suffix = 'Ab12') =>
  `https://${STORE}/codex/local/pending/${userId}/0b9a3c1e-6f0d-4b55-9e0e-2f8c1d7a9b10-${suffix}.webp`;

beforeEach(async () => {
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_store1_secret');
  vi.stubEnv('VERCEL_TARGET_ENV', '');
  vi.stubEnv('VERCEL_ENV', '');
  if (!harness.reachable) return;
  await seedUser(harness.db, 'admin');
  await seedUser(harness.db, 'u1');
  await seedUser(harness.db, 'u2');
  await seedCharacter(harness.db, 9001, { name: 'Karaka Haginen' });
  await seedCharacter(harness.db, 9002, { name: 'Freddy Confeti' });
});

const author = { userId: 'admin', characterId: null };

test.skipIf(!harness.reachable)('publishing a revision publishes the images it references and nothing else', async () => {
  await seedAsset({ id: A });
  await seedAsset({ id: B });

  const first = await publishCodexRevision({
    subject: guide,
    title: 'Rolling a C3',
    baseRevisionId: null,
    edit: { kind: 'page', blocks: [image('i1', A)] },
    summary: null,
    author,
  });

  expect(first.status).toBe('published');
  expect(await statuses()).toEqual({ [A]: 'published', [B]: 'pending' });
  const [row] = await harness.db.select().from(codexAssets).where(eq(codexAssets.id, A));
  expect(row!.publishedAt).toBeInstanceOf(Date);
});

test.skipIf(!harness.reachable)('a stale publish leaves its images pending', async () => {
  await seedAsset({ id: A });
  const seeded = await publishCodexRevision({
    subject: guide,
    title: 'Rolling a C3',
    baseRevisionId: null,
    edit: { kind: 'page', blocks: [{ type: 'paragraph', attrs: { id: 'p' }, content: [] }] },
    summary: null,
    author,
  });
  if (seeded.status !== 'published') throw new Error(seeded.status);

  const stale = await publishCodexRevision({
    subject: guide,
    title: null,
    baseRevisionId: null,
    edit: { kind: 'page', blocks: [image('i1', A)] },
    summary: null,
    author,
  });

  expect(stale).toEqual({ status: 'conflict' });
  expect(await statuses()).toEqual({ [A]: 'pending' });
});

test.skipIf(!harness.reachable)('a publish that references a removed image is a conflict', async () => {
  await seedAsset({ id: A, status: 'removed' });

  const result = await publishCodexRevision({
    subject: guide,
    title: 'Rolling a C3',
    baseRevisionId: null,
    edit: { kind: 'page', blocks: [image('i1', A)] },
    summary: null,
    author,
  });

  expect(result).toEqual({ status: 'conflict' });
  expect(await statuses()).toEqual({ [A]: 'removed' });
});

test.skipIf(!harness.reachable)('approving a suggestion publishes its screenshot', async () => {
  await seedAsset({ id: A });
  const proposalId = crypto.randomUUID();
  const submitted = await submitCodexProposal(
    {
      proposalId,
      subject: guide,
      sectionId: 'lead',
      blocks: [image('i1', A)],
      summary: 'Add a screenshot',
      baseRevisionId: null,
      submitter: { userId: 'u1', characterId: 9001 },
    },
    { ok: true, template: { title: 'Rolling a C3', doc: { type: 'doc', attrs: { schemaVersion: 1 }, content: [] } } },
  );
  expect(submitted.status).toBe('submitted');

  const outcome = await approveCodexProposal(
    proposalId,
    async () => ({ ok: true, template: { title: 'Rolling a C3', doc: { type: 'doc', attrs: { schemaVersion: 1 }, content: [] } } }),
    { headRevisionId: null, choices: {} },
  );

  expect(outcome).toBe('approved');
  expect(await statuses()).toEqual({ [A]: 'published' });
});

test.skipIf(!harness.reachable)('a pending image shows only to its uploader and the admin', async () => {
  await seedAsset({ id: A, uploader: 'u1' });
  await seedAsset({ id: P, uploader: 'u2', characterId: 9002, status: 'published' });
  await seedAsset({ id: R, uploader: 'u1', status: 'removed' });
  const ids = [A, P, R];
  const keys = async (viewer: Parameters<typeof loadCodexAssetViews>[1]) =>
    [...(await loadCodexAssetViews(ids, viewer)).keys()].sort();

  expect(await keys({ kind: 'reader' })).toEqual([P]);
  expect(await keys({ kind: 'user', userId: 'u1' })).toEqual([A, P]);
  expect(await keys({ kind: 'user', userId: 'u2' })).toEqual([P]);
  expect(await keys({ kind: 'admin' })).toEqual([A, P]);

  const views = await loadCodexAssetViews([P], { kind: 'reader' });
  expect(views.get(P)).toEqual({
    id: P,
    stem: `https://${STORE}/codex/local/img/${P}`,
    width: 1920,
    height: 1080,
    status: 'published',
    credit: 'Freddy Confeti',
  });
  expect(withImageSources([image('i1', P), image('i2', A)] as never, views)).toEqual([
    { ...image('i1', P), attrs: { ...image('i1', P).attrs, src: `https://${STORE}/codex/local/img/${P}` } },
    image('i2', A),
  ]);
});

test.skipIf(!harness.reachable)('a save may reference only images that exist and are its own or published', async () => {
  await seedAsset({ id: A, uploader: 'u1' });
  await seedAsset({ id: R, uploader: 'u1', status: 'removed' });
  const blocks = [image('i1', MISSING), image('i2', R), image('i3', A)];

  expect(await codexAssetProblems(blocks, { userId: 'u2', isAdmin: false })).toEqual([
    `content.0 (image): asset "${MISSING}" does not exist`,
    `content.1 (image): asset "${R}" is removed`,
    `content.2 (image): asset "${A}" belongs to another pilot and is not published`,
  ]);
  expect(await codexAssetProblems([image('i3', A)], { userId: 'u1', isAdmin: false })).toEqual([]);
  expect(await codexAssetProblems([image('i3', A)], { userId: 'admin', isAdmin: true })).toEqual([]);
});

test.skipIf(!harness.reachable)('finalizing the same bytes twice keeps one asset and deletes both raw uploads', async () => {
  const keys: string[] = [];
  const { port, removed } = stubPort({
    putVariant: async (key) => {
      keys.push(key);
      return `https://${STORE}/${key}`;
    },
  });
  const input = { userId: 'u1', characterId: 9001 };

  const first = await finalizeCodexUpload({ ...input, url: pendingUrl('u1', 'One') }, port);
  const second = await finalizeCodexUpload({ ...input, url: pendingUrl('u1', 'Two') }, port);

  expect([first.status, second.status]).toEqual(['created', 'reused']);
  expect(await harness.db.select({ id: codexAssets.id }).from(codexAssets)).toHaveLength(1);
  expect(removed).toEqual([[pendingUrl('u1', 'One')], [pendingUrl('u1', 'Two')]]);
  if (first.status !== 'created') throw new Error(first.status);
  expect(first.asset.stem).toBe(`https://${STORE}/codex/local/img/${first.asset.id}`);
  expect(keys).toEqual([
    `codex/local/img/${first.asset.id}-640.webp`,
    `codex/local/img/${first.asset.id}-1280.webp`,
    `codex/local/img/${first.asset.id}-1920.webp`,
  ]);
  expect([first.asset.width, first.asset.height]).toEqual([4, 3]);
});

test.skipIf(!harness.reachable)('a finalize that loses a race to the same image deletes the copies it wrote', async () => {
  const sha = createHash('sha256').update(RED_PNG).digest('hex');
  const written: string[] = [];
  let rival: Promise<void> | null = null;
  const { port, removed } = stubPort({
    putVariant: async (key) => {
      rival ??= seedAsset({ id: A, sha });
      await rival;
      written.push(`https://${STORE}/${key}`);
      return `https://${STORE}/${key}`;
    },
  });

  const result = await finalizeCodexUpload({ url: pendingUrl('u1'), userId: 'u1', characterId: 9001 }, port);

  expect(result).toEqual({
    status: 'reused',
    asset: { id: A, stem: `https://${STORE}/codex/local/img/${A}`, width: 1920, height: 1080 },
  });
  expect(removed).toEqual([written, [pendingUrl('u1')]]);
  expect(written.some((url) => url.includes(A))).toBe(false);
});

test.skipIf(!harness.reachable)('a finalize whose variant write fails deletes the copies it did write', async () => {
  const { port, removed } = stubPort({
    putVariant: async (key) => {
      if (key.endsWith('-1280.webp')) throw new Error('blob store down');
      return `https://${STORE}/${key}`;
    },
  });
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

  await expect(
    finalizeCodexUpload({ url: pendingUrl('u1'), userId: 'u1', characterId: 9001 }, port),
  ).rejects.toThrow('blob store down');

  const [written, raw] = removed;
  expect(written).toHaveLength(2);
  expect(written![0]).toMatch(new RegExp(`^https://${STORE}/codex/local/img/[0-9a-f-]{36}-640\\.webp$`));
  expect(written![1]).toBe(written![0]!.replace('-640.webp', '-1920.webp'));
  expect(raw).toEqual([pendingUrl('u1')]);
  expect(await harness.db.select().from(codexAssets)).toEqual([]);
  quiet.mockRestore();
});

test.skipIf(!harness.reachable)('re-pasting a week-old pending image keeps it from the next prune', async () => {
  const now = new Date();
  const sha = createHash('sha256').update(RED_PNG).digest('hex');
  await seedAsset({ id: A, sha, createdAt: new Date(now.getTime() - 8 * DAY) });

  const result = await finalizeCodexUpload({ url: pendingUrl('u1'), userId: 'u1', characterId: 9001 }, stubPort().port);
  const pruned = await pruneExpiredCodexAssets(harness.db, 7, now, Number.POSITIVE_INFINITY, stubPort().port);

  expect(result.status).toBe('reused');
  expect(pruned).toEqual({ deleted: 0, finished: true });
  expect(await statuses()).toEqual({ [A]: 'pending' });
});

test.skipIf(!harness.reachable)('the twenty-first upload in a day is refused and its raw file deleted', async () => {
  for (let index = 0; index < 20; index++) {
    await seedAsset({ id: `bbbbbbbb-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`, sha: `s${index}` });
  }
  const { port, removed } = stubPort();

  expect(await finalizeCodexUpload({ url: pendingUrl('u1'), userId: 'u1', characterId: 9001 }, port)).toEqual({
    status: 'quota',
  });
  expect(removed).toEqual([[pendingUrl('u1')]]);
});

test.skipIf(!harness.reachable)('uploads older than a day do not count toward the quota', async () => {
  for (let index = 0; index < 19; index++) {
    await seedAsset({ id: `bbbbbbbb-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`, sha: `s${index}` });
  }
  await seedAsset({ id: B, sha: 'old', createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) });

  const result = await finalizeCodexUpload({ url: pendingUrl('u1'), userId: 'u1', characterId: 9001 }, stubPort().port);

  expect(result.status).toBe('created');
});

test.skipIf(!harness.reachable)('bytes that are not an image leave no asset behind', async () => {
  const { port, removed } = stubPort({
    download: async () => ({ ok: true, bytes: new TextEncoder().encode('%PDF-1.4') }),
  });

  expect(await finalizeCodexUpload({ url: pendingUrl('u1'), userId: 'u1', characterId: 9001 }, port)).toEqual({
    status: 'not-image',
  });
  expect(await harness.db.select().from(codexAssets)).toEqual([]);
  expect(removed).toEqual([[pendingUrl('u1')]]);
});

test.skipIf(!harness.reachable)("another pilot's upload is refused before any storage call", async () => {
  const download = vi.fn();
  const remove = vi.fn();
  const { port } = stubPort({ download, remove });

  expect(await finalizeCodexUpload({ url: pendingUrl('u2'), userId: 'u1', characterId: 9001 }, port)).toEqual({
    status: 'forbidden-key',
  });
  expect(download).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

const X = 'cccccccc-0000-4000-8000-000000000001';
const Y = 'cccccccc-0000-4000-8000-000000000002';
const Z = 'cccccccc-0000-4000-8000-000000000003';
const W = 'cccccccc-0000-4000-8000-000000000004';
const V = 'cccccccc-0000-4000-8000-000000000005';
const E4 = 'cccccccc-0000-4000-8000-000000000006';

async function seedProposal(assetId: string, status: 'pending' | 'denied') {
  await harness.db.insert(codexProposals).values({
    id: crypto.randomUUID(),
    subjectKind: 'guides',
    subjectKey: 'rolling-a-c3',
    pageTitle: 'Rolling a C3',
    sectionId: 'lead',
    doc: [image('i1', assetId)],
    userId: 'u1',
    characterId: 9001,
    summary: 'Screenshot',
    status,
    reviewNote: status === 'denied' ? 'No thanks' : null,
    decidedAt: status === 'denied' ? new Date() : null,
  });
}

async function seedPruneFixture(now: Date) {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  await seedAsset({ id: X, createdAt: ago(8) });
  await seedAsset({ id: Y, createdAt: ago(8) });
  await seedAsset({ id: Z, createdAt: ago(8) });
  await seedAsset({ id: W, createdAt: ago(6) });
  await seedAsset({ id: V, uploader: 'u2', characterId: 9002, status: 'published', createdAt: ago(30) });
  await seedAsset({ id: E4, sha: V, createdAt: ago(8) });
  await seedProposal(Y, 'pending');
  await seedProposal(Z, 'denied');
}

test.skipIf(!harness.reachable)('the daily prune deletes only unreferenced week-old pending images and their blobs', async () => {
  const now = new Date();
  await seedPruneFixture(now);
  const { port, removed } = stubPort();

  const result = await pruneExpiredCodexAssets(harness.db, 7, now, Number.POSITIVE_INFINITY, port);

  expect(result).toEqual({ deleted: 3, finished: true });
  expect(await statuses()).toEqual({ [Y]: 'pending', [W]: 'pending', [V]: 'published' });
  expect(removed.flat().sort()).toEqual(
    [...Object.values(variantsFor(X)), ...Object.values(variantsFor(Z)), ...Object.values(variantsFor(E4))].sort(),
  );
});

function blobStore() {
  const live = new Set<string>();
  let beforeDelete: () => Promise<void> = async () => {};
  const port: CodexBlobPort = {
    ...stubPort().port,
    putVariant: async (key) => {
      live.add(`https://${STORE}/${key}`);
      return `https://${STORE}/${key}`;
    },
    remove: async (urls) => {
      await beforeDelete();
      for (const url of urls) live.delete(url);
    },
  };
  return { port, live, whileDeleting: (work: () => Promise<void>) => (beforeDelete = work) };
}

test.skipIf(!harness.reachable)("pruning one pilot's image never deletes the blobs of another pilot's identical upload", async () => {
  const { port, live, whileDeleting } = blobStore();
  const first = await finalizeCodexUpload({ url: pendingUrl('u1'), userId: 'u1', characterId: 9001 }, port);
  if (first.status !== 'created') throw new Error(first.status);
  await codexPurgeContributor.purgeUser!({ kind: 'user', userId: 'u1' });
  let second: Awaited<ReturnType<typeof finalizeCodexUpload>> | null = null;
  whileDeleting(async () => {
    whileDeleting(async () => {});
    second = await finalizeCodexUpload({ url: pendingUrl('u2'), userId: 'u2', characterId: 9002 }, port);
  });

  expect(await pruneExpiredCodexAssets(harness.db, 7, new Date(), Number.POSITIVE_INFINITY, port)).toEqual({
    deleted: 1,
    finished: true,
  });

  if (second!.status !== 'created') throw new Error(second!.status);
  const [kept] = await harness.db.select({ variants: codexAssets.variants }).from(codexAssets);
  expect([...live].sort()).toEqual(Object.values(kept!.variants).sort());
});

test.skipIf(!harness.reachable)('a blob delete that fails leaves the row removed for the next run', async () => {
  const now = new Date();
  await seedAsset({ id: X, createdAt: new Date(now.getTime() - 8 * DAY) });
  await seedAsset({ id: Z, createdAt: new Date(now.getTime() - 8 * DAY) });
  let calls = 0;
  const { port } = stubPort({
    remove: async () => {
      calls += 1;
      if (calls === 2) throw new Error('blob store down');
    },
  });
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

  expect(await pruneExpiredCodexAssets(harness.db, 7, now, Number.POSITIVE_INFINITY, port)).toEqual({
    deleted: 1,
    finished: false,
  });
  expect(Object.values(await statuses())).toEqual(['removed']);
  expect(await pruneExpiredCodexAssets(harness.db, 7, now, Number.POSITIVE_INFINITY, stubPort().port)).toEqual({
    deleted: 1,
    finished: true,
  });
  expect(await statuses()).toEqual({});
  quiet.mockRestore();
});

test.skipIf(!harness.reachable)('purging a pilot retires their pending images and keeps published ones without them', async () => {
  await seedAsset({ id: A, uploader: 'u1' });
  await seedAsset({ id: P, uploader: 'u1', status: 'published' });

  await codexPurgeContributor.purgeUser!({ kind: 'user', userId: 'u1' });

  const rows = await harness.db
    .select({ id: codexAssets.id, status: codexAssets.status, uploader: codexAssets.userId, character: codexAssets.characterId })
    .from(codexAssets)
    .orderBy(asc(codexAssets.id));
  expect(rows).toEqual([
    { id: A, status: 'removed', uploader: null, character: null },
    { id: P, status: 'published', uploader: null, character: null },
  ]);
});

test.skipIf(!harness.reachable)("purging a pilot evicts the cached screenshot credit that names them", async () => {
  await seedAsset({ id: P, uploader: 'u1', status: 'published' });
  cache.cacheTag.mockClear();
  cache.revalidateTag.mockClear();

  const views = await loadCodexPageAssets(guide, [image('i1', P)] as never, { kind: 'reader' });
  await codexPurgeContributor.purgeCharacter!({ kind: 'character', userId: 'u1', characterId: 9001 });

  expect(views.get(P)?.credit).toBe('Karaka Haginen');
  expect(cache.cacheTag.mock.calls).toEqual([['codex:page:guides:rolling-a-c3', 'codex:credits']]);
  expect(cache.revalidateTag).toHaveBeenCalledWith('codex:credits', { expire: 0 });
});

test.skipIf(!harness.reachable)('merging accounts moves images to the survivor without breaking the per-uploader index', async () => {
  await seedAsset({ id: A, sha: 'same', uploader: 'u1' });
  await seedAsset({ id: B, sha: 'same', uploader: 'u2', characterId: 9002 });
  await seedAsset({ id: P, sha: 'only-u1', uploader: 'u1', status: 'published' });

  const rule = codexPurgeContributor.merge.find((entry) => entry.rule === 'custom')!;
  if (rule.rule !== 'custom') throw new Error('expected the custom merge rule');
  await rule.merge(harness.db, { sourceUserId: 'u1', survivorUserId: 'u2' });

  const rows = await harness.db
    .select({ id: codexAssets.id, status: codexAssets.status, uploader: codexAssets.userId })
    .from(codexAssets)
    .orderBy(asc(codexAssets.id));
  expect(rows).toEqual([
    { id: A, status: 'removed', uploader: 'u2' },
    { id: B, status: 'pending', uploader: 'u2' },
    { id: P, status: 'published', uploader: 'u2' },
  ]);
});

test.skipIf(!harness.reachable)('merging accounts points pending suggestions at the copy of an image that survives', async () => {
  await seedAsset({ id: A, sha: 'both-pending', uploader: 'u1' });
  await seedAsset({ id: B, sha: 'both-pending', uploader: 'u2', characterId: 9002 });
  await seedAsset({ id: P, sha: 'source-published', uploader: 'u1', status: 'published' });
  await seedAsset({ id: R, sha: 'source-published', uploader: 'u2', characterId: 9002 });
  const proposalId = crypto.randomUUID();
  await harness.db.insert(codexProposals).values({
    id: proposalId,
    subjectKind: 'guides',
    subjectKey: 'rolling-a-c3',
    pageTitle: 'Rolling a C3',
    sectionId: 'lead',
    doc: [image('i1', A), image('i2', R)],
    userId: 'u1',
    characterId: 9001,
    summary: 'Two screenshots',
  });

  const rule = codexPurgeContributor.merge.find((entry) => entry.rule === 'custom')!;
  if (rule.rule !== 'custom') throw new Error('expected the custom merge rule');
  await rule.merge(harness.db, { sourceUserId: 'u1', survivorUserId: 'u2' });

  const [proposal] = await harness.db.select({ doc: codexProposals.doc }).from(codexProposals);
  expect(proposal!.doc).toEqual([image('i1', B), image('i2', P)]);
  expect(await statuses()).toEqual({ [A]: 'removed', [B]: 'pending', [P]: 'published', [R]: 'removed' });
  expect(await codexAssetProblems(proposal!.doc as unknown[], { userId: 'u2', isAdmin: false })).toEqual([]);
});

test.skipIf(!harness.reachable)('the orphan sweep removes raw uploads abandoned for over an hour', async () => {
  const now = new Date();
  const removed: string[][] = [];
  const old = pendingUrl('u1', 'Old');
  const abandoned = pendingUrl('u1', 'Abandoned');
  const fresh = pendingUrl('u1', 'Fresh');
  const port: CodexBlobPort = {
    ...stubPort().port,
    listPending: async function* () {
      yield { url: old, uploadedAt: new Date(now.getTime() - 8 * DAY) };
      yield { url: abandoned, uploadedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) };
      yield { url: fresh, uploadedAt: new Date(now.getTime() - 30 * 60 * 1000) };
    },
    remove: async (urls) => {
      removed.push([...urls]);
    },
  };

  expect(await sweepOrphanPendingBlobs(now, port)).toBe(2);
  expect(removed).toEqual([[old, abandoned]]);
});
