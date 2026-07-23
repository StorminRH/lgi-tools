import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyPgDb } from '@/lib/db-types';

const esiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/platform/esi', () => ({
  esiFetch: (...args: unknown[]) => esiFetchMock(...args),
  esiUrl: (path: string) => new URL(path, 'https://esi.example'),
}));

import { resolveNpcStationNames } from './station-names';

function dbWithRows(rows: { id: number }[]) {
  const execute = vi.fn().mockResolvedValue(undefined);
  const db = {
    select: () => ({
      from: () => ({
        where: async () => rows,
      }),
    }),
    execute,
  } as unknown as AnyPgDb;
  return { db, execute };
}

beforeEach(() => {
  esiFetchMock.mockReset();
});

describe('resolveNpcStationNames', () => {
  it('returns without dispatch when every station is already resolved', async () => {
    const { db, execute } = dbWithRows([]);

    await expect(resolveNpcStationNames(db)).resolves.toEqual({ resolved: 0 });
    expect(esiFetchMock).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('filters non-station results and writes one batch', async () => {
    const { db, execute } = dbWithRows([{ id: 60_000_001 }, { id: 60_000_002 }]);
    esiFetchMock.mockResolvedValue(
      Response.json([
        { category: 'station', id: 60_000_001, name: 'First Station' },
        { category: 'constellation', id: 60_000_002, name: 'Not a station' },
      ]),
    );

    await expect(resolveNpcStationNames(db)).resolves.toEqual({ resolved: 1 });
    expect(esiFetchMock).toHaveBeenCalledWith(
      new URL('/universe/names/', 'https://esi.example'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify([60_000_001, 60_000_002]),
      }),
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('keeps the batch unresolved when the ESI request fails', async () => {
    const { db, execute } = dbWithRows([{ id: 60_000_001 }]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    esiFetchMock.mockRejectedValue(new Error('offline'));

    await expect(resolveNpcStationNames(db)).resolves.toEqual({ resolved: 0 });
    expect(execute).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();

    warn.mockRestore();
  });
});
