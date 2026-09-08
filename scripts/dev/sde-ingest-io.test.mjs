import { beforeEach, expect, test, vi } from 'vitest';
import { ingestAndStampSdeVersion, readSdeSentinelCounts } from '../../src/scripts/sde-ingest-io';
import { SDE_META_KEY_VERSION } from '../../src/data/eve-data/constants';

const mocks = vi.hoisted(() => ({ ingest: vi.fn(), stamp: vi.fn(), remote: vi.fn() }));
vi.mock('../../src/data/eve-data/ingest', () => ({ runIngest: mocks.ingest }));
vi.mock('../../src/data/eve-data/meta', () => ({ setSdeMetaValue: mocks.stamp }));
vi.mock('../../src/data/eve-data/source', () => ({ getRemoteSdeVersion: mocks.remote }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.ingest.mockResolvedValue({ typesWritten: 3 });
  mocks.remote.mockResolvedValue('123');
});

test('sentinel query converts database counts and preserves an empty table for readiness rejection', async () => {
  const execute = vi.fn().mockResolvedValue([{ rowCount: '42', universeRowCount: '0', jumpsRowCount: '7' }]);
  await expect(readSdeSentinelCounts({ execute })).resolves.toEqual({ typeDogma: 42, npcStations: 0, systemJumps: 7 });
  expect(execute).toHaveBeenCalledOnce();
});

test('missing or failed sentinel results cannot become a complete baseline', async () => {
  const execute = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('database unavailable'));
  await expect(readSdeSentinelCounts({ execute })).rejects.toThrow('SDE sentinel count query returned no row');
  await expect(readSdeSentinelCounts({ execute })).rejects.toThrow('database unavailable');
});

test('ingest uses the supplied manifest revision and stamps only after successful writes', async () => {
  const db = {};
  await expect(ingestAndStampSdeVersion(db, { keepCache: true, remoteVersion: '456' })).resolves.toEqual({ summary: { typesWritten: 3 }, sdeVersion: '456' });
  expect(mocks.ingest).toHaveBeenCalledWith(db, { keepCache: true });
  expect(mocks.remote).not.toHaveBeenCalled();
  expect(mocks.stamp).toHaveBeenCalledWith(db, SDE_META_KEY_VERSION, '456');
  expect(mocks.ingest.mock.invocationCallOrder[0]).toBeLessThan(mocks.stamp.mock.invocationCallOrder[0]);
});

test('ingest obtains the current revision when none was supplied', async () => {
  const db = {};
  await expect(ingestAndStampSdeVersion(db)).resolves.toMatchObject({ sdeVersion: '123' });
  expect(mocks.remote).toHaveBeenCalledOnce();
  expect(mocks.stamp).toHaveBeenCalledWith(db, SDE_META_KEY_VERSION, '123');
});

test.each(['ingest', 'manifest', 'stamp'])('%s failure rejects without claiming a stamped revision', async (failure) => {
  if (failure === 'ingest') mocks.ingest.mockRejectedValue(new Error('ingest failed'));
  if (failure === 'manifest') mocks.remote.mockResolvedValue(null);
  if (failure === 'stamp') mocks.stamp.mockRejectedValue(new Error('stamp failed'));
  await expect(ingestAndStampSdeVersion({})).rejects.toThrow();
  if (failure !== 'stamp') expect(mocks.stamp).not.toHaveBeenCalled();
  if (failure === 'ingest') expect(mocks.remote).not.toHaveBeenCalled();
});
