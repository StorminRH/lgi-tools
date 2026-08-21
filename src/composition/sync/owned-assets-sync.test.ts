import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  encryptSnapshotBodyMock: vi.fn((_body: unknown[]) => 'v1:iv:tag:ciphertext'),
  insertEsiSnapshotMock: vi.fn(async (_input: unknown) => 44),
  deleteEsiSnapshotMock: vi.fn(async (_id: number) => {}),
  saveOwnedAssetsMock: vi.fn(
    async (
      _owner: unknown,
      _rows: unknown,
      _etags: unknown,
      _snapshotId?: unknown,
    ): Promise<'saved' | 'superseded'> => 'saved',
  ),
  emitDomainEventMock: vi.fn(),
}));

vi.mock('@/data/domain-events/queries', () => ({
  emitDomainEvent: (input: unknown) => mocks.emitDomainEventMock(input),
}));

vi.mock('@/data/esi-snapshots/crypto', () => ({
  encryptSnapshotBody: (body: unknown[]) => mocks.encryptSnapshotBodyMock(body),
}));

vi.mock('@/data/esi-snapshots/queries', () => ({
  insertEsiSnapshot: (input: unknown) => mocks.insertEsiSnapshotMock(input),
  deleteEsiSnapshot: (id: number) => mocks.deleteEsiSnapshotMock(id),
}));

vi.mock('@/features/owned-assets/queries', () => ({
  getOwnedAssetMap: vi.fn(),
  readOwnerSyncState: vi.fn(),
  saveOwnedAssets: (owner: unknown, rows: unknown, etags: unknown, snapshotId?: unknown) =>
    snapshotId === undefined
      ? mocks.saveOwnedAssetsMock(owner, rows, etags)
      : mocks.saveOwnedAssetsMock(owner, rows, etags, snapshotId),
  stampOwnerFresh: vi.fn(),
}));

const rows = [
  {
    type_id: 34,
    quantity: 12,
    location_id: 60003760,
    location_flag: 'CorpSAG1',
    location_type: 'station',
  },
];
const source = {
  endpoint: '/corporations/5000/assets/',
  items: [{ item_id: 101 }],
  responseHeaders: [
    {
      page: 1,
      cacheControl: 'private, max-age=3600',
      etag: '"corp-assets"',
      lastModified: 'Tue, 14 Jul 2026 12:00:00 GMT',
      xPages: 1,
    },
  ],
};

async function loadSave() {
  const { saveOwnedAssetsFromSource } = await import('./owned-assets-source-save');
  return saveOwnedAssetsFromSource;
}

describe('saveOwnedAssetsFromSource', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.encryptSnapshotBodyMock.mockClear();
    mocks.insertEsiSnapshotMock.mockClear();
    mocks.deleteEsiSnapshotMock.mockClear();
    mocks.saveOwnedAssetsMock.mockReset();
    mocks.emitDomainEventMock.mockReset();
    mocks.saveOwnedAssetsMock.mockResolvedValue('saved');
  });

  it('keeps character saves on the existing path with no snapshot', async () => {
    const save = await loadSave();

    await save({ ownerType: 'character', ownerId: 7 }, rows, ['"etag"'], source);

    expect(mocks.insertEsiSnapshotMock).not.toHaveBeenCalled();
    expect(mocks.emitDomainEventMock).not.toHaveBeenCalled();
    expect(mocks.saveOwnedAssetsMock).toHaveBeenCalledWith(
      { ownerType: 'character', ownerId: 7 },
      rows,
      ['"etag"'],
    );
  });

  it('writes one encrypted corp snapshot and gives its id to every derived row save', async () => {
    const save = await loadSave();

    await save({ ownerType: 'corporation', ownerId: 5000 }, rows, ['"fallback"'], source);

    expect(mocks.encryptSnapshotBodyMock).toHaveBeenCalledWith(source.items);
    expect(mocks.insertEsiSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: 'corporation',
        ownerId: 5000,
        endpoint: source.endpoint,
        etag: '"corp-assets"',
        responseHeaders: source.responseHeaders,
        sourceVersion: '2025-08-26',
        bodyCiphertext: 'v1:iv:tag:ciphertext',
      }),
    );
    expect(mocks.saveOwnedAssetsMock).toHaveBeenCalledWith(
      { ownerType: 'corporation', ownerId: 5000 },
      rows,
      ['"fallback"'],
      44,
    );
    expect(mocks.emitDomainEventMock).toHaveBeenCalledWith({
      eventType: 'esi_snapshot_pulled',
      metadata: {
        snapshotId: 44,
        dataset: 'owned_assets',
        ownerType: 'corporation',
        ownerId: 5000,
        itemCount: 1,
      },
    });
  });

  it('removes an orphan snapshot when the existing derived save fails', async () => {
    const save = await loadSave();
    mocks.saveOwnedAssetsMock.mockRejectedValueOnce(new Error('derived save failed'));

    await expect(
      save({ ownerType: 'corporation', ownerId: 5000 }, rows, [], source),
    ).rejects.toThrow('derived save failed');

    expect(mocks.deleteEsiSnapshotMock).toHaveBeenCalledWith(44);
    expect(mocks.emitDomainEventMock).not.toHaveBeenCalled();
  });

  it('discards the snapshot and emits nothing when a concurrent refresh supersedes the save', async () => {
    const save = await loadSave();
    mocks.saveOwnedAssetsMock.mockResolvedValueOnce('superseded');

    await expect(
      save({ ownerType: 'corporation', ownerId: 5000 }, rows, [], source),
    ).resolves.toBeUndefined();

    expect(mocks.deleteEsiSnapshotMock).toHaveBeenCalledWith(44);
    expect(mocks.emitDomainEventMock).not.toHaveBeenCalled();
  });

  it('does not fail the save when discarding a superseded snapshot fails', async () => {
    const save = await loadSave();
    mocks.saveOwnedAssetsMock.mockResolvedValueOnce('superseded');
    mocks.deleteEsiSnapshotMock.mockRejectedValueOnce(new Error('cleanup failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      save({ ownerType: 'corporation', ownerId: 5000 }, rows, [], source),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    expect(mocks.emitDomainEventMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
