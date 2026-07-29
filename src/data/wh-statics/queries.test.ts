import { describe, expect, it, vi } from 'vitest';
import type { AnyPgDb } from '@/lib/db-types';
import { readSystemStatics } from './queries';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

function databaseReturning(
  rows: ReadonlyArray<{
    systemId: number;
    code: string;
    feedVersion: string;
  }>,
): AnyPgDb {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const from = vi.fn(() => ({ orderBy }));
  const select = vi.fn(() => ({ from }));
  return { select } as unknown as AnyPgDb;
}

describe('promoted statics reader', () => {
  it('returns an empty unversioned projection before the first promotion', async () => {
    await expect(readSystemStatics(databaseReturning([]))).resolves.toEqual({
      version: '',
      systems: [],
    });
  });

  it('groups ordered serving rows and carries their promoted feed version', async () => {
    await expect(
      readSystemStatics(
        databaseReturning([
          { systemId: 31_001_361, code: 'U210', feedVersion: '11' },
          { systemId: 31_001_677, code: 'C247', feedVersion: '11' },
          { systemId: 31_001_677, code: 'N766', feedVersion: '11' },
        ]),
      ),
    ).resolves.toEqual({
      version: '11',
      systems: [
        { systemId: 31_001_361, codes: ['U210'] },
        { systemId: 31_001_677, codes: ['C247', 'N766'] },
      ],
    });
  });
});
