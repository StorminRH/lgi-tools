import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { characterSheets } from './schema';
import type { SectionEnvelope } from './types';

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: mocks.revalidateTag,
}));

import {
  getCharacterSheets,
  readSheetRow,
  saveSheetSection,
  sheetTag,
  stampSheetSection,
} from './queries';

const harness = await createDbTestHarness({
  schema: 'test_character_sheet_queries',
  tables: ['character_sheets'],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

const T0 = '2026-09-27T11:00:00.000Z';
const T1 = '2026-09-27T11:05:00.000Z';

const wallet = (balance: number, refreshedAt = T0): SectionEnvelope<'wallet'> => ({
  data: { balance },
  refreshedAt,
  etags: { balance: `"w-${balance}"` },
});

const profile: SectionEnvelope<'profile'> = {
  data: { character: { birthday: '2014-03-11T09:42:00Z', securityStatus: 2.3 } },
  refreshedAt: T0,
  etags: { character: '"p"' },
};

async function readRow(characterId: number) {
  const [row] = await harness.db
    .select()
    .from(characterSheets)
    .where(eq(characterSheets.characterId, characterId));
  return row;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe.skipIf(!harness.reachable)('character sheet queries execute against Postgres', () => {
  it('inserts the first section and merges the second into the same row', async () => {
    await saveSheetSection(101, 'wallet', wallet(10));
    expect(await readRow(101)).toEqual({
      characterId: 101,
      sections: { wallet: wallet(10) },
      lastRefreshedAt: expect.any(Date),
    });

    await saveSheetSection(101, 'profile', profile);
    expect((await readRow(101))?.sections).toEqual({ wallet: wallet(10), profile });
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(2);
    expect(mocks.revalidateTag).toHaveBeenCalledWith(sheetTag(101), 'max');
  });

  it('keeps both sections when two saves run concurrently', async () => {
    await Promise.all([
      saveSheetSection(202, 'wallet', wallet(20)),
      saveSheetSection(202, 'profile', profile),
    ]);
    const rows = await harness.db.select().from(characterSheets).where(eq(characterSheets.characterId, 202));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sections).toEqual({ wallet: wallet(20), profile });
  });

  it('is idempotent for a repeated save and replaces a section wholesale', async () => {
    await saveSheetSection(303, 'wallet', { ...wallet(30), denied: true });
    await saveSheetSection(303, 'wallet', { ...wallet(30), denied: true });
    expect((await readRow(303))?.sections).toEqual({ wallet: { ...wallet(30), denied: true } });

    await saveSheetSection(303, 'wallet', wallet(31, T1));
    expect((await readRow(303))?.sections).toEqual({ wallet: wallet(31, T1) });
  });

  it('advances the row stamp on every save', async () => {
    await saveSheetSection(404, 'wallet', wallet(40));
    const first = (await readRow(404))!.lastRefreshedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await saveSheetSection(404, 'profile', profile);
    expect((await readRow(404))!.lastRefreshedAt.getTime()).toBeGreaterThan(first.getTime());
  });

  it('stamps only the named section and leaves its data and ETags alone', async () => {
    await saveSheetSection(505, 'wallet', wallet(50));
    await saveSheetSection(505, 'profile', profile);
    vi.clearAllMocks();

    await stampSheetSection(505, 'wallet');

    const sections = (await readRow(505))!.sections;
    expect(sections.profile).toEqual(profile);
    expect(sections.wallet).toMatchObject({ data: { balance: 50 }, etags: { balance: '"w-50"' } });
    expect(Date.parse(sections.wallet!.refreshedAt)).toBeGreaterThan(Date.parse(T0));
    expect(mocks.revalidateTag).toHaveBeenCalledWith(sheetTag(505), 'max');
  });

  it('leaves the row untouched when stamping a section it does not have', async () => {
    await saveSheetSection(606, 'wallet', wallet(60));
    const before = await readRow(606);

    await stampSheetSection(606, 'profile');
    await stampSheetSection(707, 'wallet');

    expect(await readRow(606)).toEqual(before);
    expect(await readRow(707)).toBeUndefined();
  });

  it('reads back rows and drops characters without a sheet', async () => {
    await saveSheetSection(808, 'wallet', wallet(80));

    expect(await readSheetRow(808)).toEqual({ wallet: wallet(80) });
    expect(await readSheetRow(809)).toBeNull();
    const map = await getCharacterSheets([808, 809]);
    expect([...map.keys()]).toEqual([808]);
    expect(map.get(808)).toEqual({ wallet: wallet(80) });
  });
});
