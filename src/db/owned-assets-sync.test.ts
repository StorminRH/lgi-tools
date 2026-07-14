import { beforeEach, describe, expect, it, vi } from 'vitest';

const encryptSnapshotBodyMock = vi.fn((_body: unknown[]) => 'v1:iv:tag:ciphertext');
const insertEsiSnapshotMock = vi.fn(async (_input: unknown) => 44);
const deleteEsiSnapshotMock = vi.fn(async (_id: number) => {});
const saveOwnedAssetsMock = vi.fn(
  async (_owner: unknown, _rows: unknown, _etags: unknown, _snapshotId?: unknown) => {},
);

vi.mock('@/data/esi-snapshots/crypto', () => ({
  encryptSnapshotBody: (body: unknown[]) => encryptSnapshotBodyMock(body),
}));

vi.mock('@/data/esi-snapshots/queries', () => ({
  insertEsiSnapshot: (input: unknown) => insertEsiSnapshotMock(input),
  deleteEsiSnapshot: (id: number) => deleteEsiSnapshotMock(id),
}));

vi.mock('@/features/owned-assets/queries', () => ({
  getOwnedAssetMap: vi.fn(),
  readOwnerSyncState: vi.fn(),
  saveOwnedAssets: (owner: unknown, rows: unknown, etags: unknown, snapshotId?: unknown) =>
    snapshotId === undefined
      ? saveOwnedAssetsMock(owner, rows, etags)
      : saveOwnedAssetsMock(owner, rows, etags, snapshotId),
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
  const { saveOwnedAssetsFromSource } = await import('./owned-assets-sync');
  return saveOwnedAssetsFromSource;
}

describe('saveOwnedAssetsFromSource', () => {
  beforeEach(() => {
    vi.resetModules();
    encryptSnapshotBodyMock.mockClear();
    insertEsiSnapshotMock.mockClear();
    deleteEsiSnapshotMock.mockClear();
    saveOwnedAssetsMock.mockReset();
    saveOwnedAssetsMock.mockResolvedValue(undefined);
  });

  it('keeps character saves on the existing path with no snapshot', async () => {
    const save = await loadSave();

    await save({ ownerType: 'character', ownerId: 7 }, rows, ['"etag"'], source);

    expect(insertEsiSnapshotMock).not.toHaveBeenCalled();
    expect(saveOwnedAssetsMock).toHaveBeenCalledWith(
      { ownerType: 'character', ownerId: 7 },
      rows,
      ['"etag"'],
    );
  });

  it('writes one encrypted corp snapshot and gives its id to every derived row save', async () => {
    const save = await loadSave();

    await save({ ownerType: 'corporation', ownerId: 5000 }, rows, ['"fallback"'], source);

    expect(encryptSnapshotBodyMock).toHaveBeenCalledWith(source.items);
    expect(insertEsiSnapshotMock).toHaveBeenCalledWith(
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
    expect(saveOwnedAssetsMock).toHaveBeenCalledWith(
      { ownerType: 'corporation', ownerId: 5000 },
      rows,
      ['"fallback"'],
      44,
    );
  });

  it('removes an orphan snapshot when the existing derived save fails', async () => {
    const save = await loadSave();
    saveOwnedAssetsMock.mockRejectedValueOnce(new Error('derived save failed'));

    await expect(
      save({ ownerType: 'corporation', ownerId: 5000 }, rows, [], source),
    ).rejects.toThrow('derived save failed');

    expect(deleteEsiSnapshotMock).toHaveBeenCalledWith(44);
  });
});
