import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_TX } from '@/platform/owner-sync/__tests__/owner-fixtures';

const mocks = vi.hoisted(() => ({
  encryptSnapshotBodyMock: vi.fn((_body: unknown[]) => 'v1:iv:tag:ciphertext'),
  insertEsiSnapshotMock: vi.fn(async (_input: unknown, _database: unknown) => 44),
  saveOwnedAssetsMock: vi.fn(
    async (_owner: unknown, _rows: unknown, _etags: unknown, _database: unknown): Promise<'saved' | 'superseded'> => 'saved',
  ),
  emitDomainEventMock: vi.fn(),
  saveCorpOwnedAssetsMock: vi.fn(async (..._args: unknown[]): Promise<'saved' | 'superseded'> => 'saved'),
}));

vi.mock('@/data/domain-events/queries', () => ({
  emitDomainEvent: (input: unknown) => mocks.emitDomainEventMock(input),
}));

vi.mock('@/data/esi-snapshots/crypto', () => ({
  encryptSnapshotBody: (body: unknown[]) => mocks.encryptSnapshotBodyMock(body),
}));

vi.mock('@/data/esi-snapshots/queries', () => ({
  insertEsiSnapshot: (input: unknown, database: unknown) => mocks.insertEsiSnapshotMock(input, database),
}));

vi.mock('@/features/owned-assets/queries', () => ({
  getOwnedAssetMap: vi.fn(),
  saveCorpOwnedAssets: (...args: unknown[]) => mocks.saveCorpOwnedAssetsMock(...args),
  readOwnerSyncState: vi.fn(),
  saveOwnedAssets: (owner: unknown, rows: unknown, etags: unknown, database: unknown) =>
    mocks.saveOwnedAssetsMock(owner, rows, etags, database),
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
  items: [
    { item_id: 101, type_id: 27, quantity: 1, location_id: 60003760, location_type: 'station', location_flag: 'OfficeFolder' },
    { item_id: 102, type_id: 34, quantity: 12, location_id: 101, location_type: 'item', location_flag: 'CorpSAG1' },
  ],
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
    mocks.saveOwnedAssetsMock.mockReset();
    mocks.emitDomainEventMock.mockReset();
    mocks.saveCorpOwnedAssetsMock.mockReset();
    mocks.saveOwnedAssetsMock.mockResolvedValue('saved');
    mocks.saveCorpOwnedAssetsMock.mockResolvedValue('saved');
  });

  it('keeps character saves on the existing path with no snapshot, on the commit\'s transaction', async () => {
    const save = await loadSave();

    await expect(save({ ownerType: 'character', ownerId: 7 }, rows, ['"etag"'], source, FAKE_TX)).resolves.toBe('saved');

    expect(mocks.insertEsiSnapshotMock).not.toHaveBeenCalled();
    expect(mocks.saveCorpOwnedAssetsMock).not.toHaveBeenCalled();
    expect(mocks.emitDomainEventMock).not.toHaveBeenCalled();
    expect(mocks.saveOwnedAssetsMock).toHaveBeenCalledWith(
      { ownerType: 'character', ownerId: 7 },
      rows,
      ['"etag"'],
      FAKE_TX,
    );
  });

  it('publishes the holding index and corp rows together, on the commit\'s transaction', async () => {
    const save = await loadSave();

    await expect(save({ ownerType: 'corporation', ownerId: 5000 }, rows, [], source, FAKE_TX)).resolves.toBe('saved');

    expect(mocks.saveCorpOwnedAssetsMock).toHaveBeenCalledTimes(1);
    const [corporationId, index] = mocks.saveCorpOwnedAssetsMock.mock.calls[0]!;
    expect(corporationId).toBe(5000);
    expect([...(index as { interiors: Map<number, unknown> }).interiors]).toEqual([
      [60003760, { kind: 'root', rootId: 60003760 }],
      [101, { kind: 'office', rootId: 60003760 }],
    ]);
    expect(mocks.saveCorpOwnedAssetsMock).toHaveBeenCalledWith(5000, index, rows, [], 44, { database: FAKE_TX });
    expect(mocks.saveOwnedAssetsMock).not.toHaveBeenCalled();
  });

  it('saves nothing, and says so, when the payload is not a corp asset list, so its answer is not recorded', async () => {
    const save = await loadSave();

    await expect(
      save({ ownerType: 'corporation', ownerId: 5000 }, rows, [], { ...source, items: [{ item_id: 101 }] }, FAKE_TX),
    ).resolves.toBe('superseded');

    expect(mocks.insertEsiSnapshotMock).not.toHaveBeenCalled();
    expect(mocks.saveCorpOwnedAssetsMock).not.toHaveBeenCalled();
    expect(mocks.saveOwnedAssetsMock).not.toHaveBeenCalled();
    expect(mocks.emitDomainEventMock).not.toHaveBeenCalled();
  });

  it('writes one encrypted corp snapshot on the commit\'s transaction and gives its id to every derived row save', async () => {
    const save = await loadSave();

    await save({ ownerType: 'corporation', ownerId: 5000 }, rows, ['"fallback"'], source, FAKE_TX);

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
      FAKE_TX,
    );
    expect(mocks.saveCorpOwnedAssetsMock).toHaveBeenCalledWith(
      5000,
      expect.anything(),
      rows,
      ['"fallback"'],
      44,
      { database: FAKE_TX },
    );
    expect(mocks.emitDomainEventMock).toHaveBeenCalledWith({
      eventType: 'esi_snapshot_pulled',
      metadata: {
        snapshotId: 44,
        dataset: 'owned_assets',
        ownerType: 'corporation',
        ownerId: 5000,
        itemCount: 2,
      },
    });
  });

  it('rethrows a failed derived save, emitting nothing, so the commit rolls the snapshot back with it', async () => {
    const save = await loadSave();
    mocks.saveCorpOwnedAssetsMock.mockRejectedValueOnce(new Error('derived save failed'));

    await expect(
      save({ ownerType: 'corporation', ownerId: 5000 }, rows, [], source, FAKE_TX),
    ).rejects.toThrow('derived save failed');

    expect(mocks.emitDomainEventMock).not.toHaveBeenCalled();
  });

  it('reports a superseded publication and emits nothing, so the commit rolls the snapshot back', async () => {
    const save = await loadSave();
    mocks.saveCorpOwnedAssetsMock.mockResolvedValueOnce('superseded');

    await expect(
      save({ ownerType: 'corporation', ownerId: 5000 }, rows, [], source, FAKE_TX),
    ).resolves.toBe('superseded');

    expect(mocks.emitDomainEventMock).not.toHaveBeenCalled();
  });
});
