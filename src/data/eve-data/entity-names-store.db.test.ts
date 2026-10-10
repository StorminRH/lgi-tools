import { describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import {
  ENTITY_NAME_RETENTION_DAYS,
  pruneEntityNames,
  readStoredEntityNames,
  storeEntityNames,
} from './entity-names-store';
import { eveEntityNames } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_entity_names_store',
  tables: ['eve_entity_names'],
  resetBetweenTests: 'truncate',
  steerDbProxy: true,
});

const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!harness.reachable)('entity names store', () => {
  it('stores names and misses, and reads back only the ids asked for', async () => {
    const resolvedAt = new Date('2026-10-01T00:00:00Z');
    await storeEntityNames(
      [
        { id: 90_000_001, name: 'Pilot One', category: 'character' },
        { id: 98_000_001, name: null, category: null },
        { id: 99_000_001, name: 'Alliance', category: 'alliance' },
      ],
      resolvedAt,
    );

    const stored = await readStoredEntityNames([90_000_001, 98_000_001, 12345]);

    expect(stored).toEqual(new Map([
      [90_000_001, { name: 'Pilot One', category: 'character', resolvedAt }],
      [98_000_001, { name: null, category: null, resolvedAt }],
    ]));
  });

  it('replaces an older answer for the same id', async () => {
    await storeEntityNames([{ id: 7, name: null, category: null }], new Date('2026-10-01T00:00:00Z'));
    const later = new Date('2026-10-02T00:00:00Z');
    await storeEntityNames([{ id: 7, name: 'Renamed', category: 'corporation' }], later);

    expect((await readStoredEntityNames([7])).get(7)).toEqual({
      name: 'Renamed',
      category: 'corporation',
      resolvedAt: later,
    });
  });

  it('reads and writes more ids than one statement chunk holds', async () => {
    const rows = Array.from({ length: 1_500 }, (_, index) => ({
      id: index + 1,
      name: `Name ${index + 1}`,
      category: 'character',
    }));
    await storeEntityNames(rows, new Date());

    const stored = await readStoredEntityNames(rows.map((row) => row.id));

    expect(stored.size).toBe(1_500);
    expect(stored.get(1_500)?.name).toBe('Name 1500');
  });

  it('prunes rows not resolved within the retention window', async () => {
    const now = new Date('2026-10-10T00:00:00Z');
    await storeEntityNames([{ id: 1, name: 'Old', category: null }], new Date(now.getTime() - (ENTITY_NAME_RETENTION_DAYS + 1) * DAY));
    await storeEntityNames([{ id: 2, name: 'Recent', category: null }], new Date(now.getTime() - DAY));

    await expect(pruneEntityNames(harness.db, ENTITY_NAME_RETENTION_DAYS, now)).resolves.toEqual({
      deleted: 1,
      finished: true,
    });
    expect((await harness.db.select({ id: eveEntityNames.id }).from(eveEntityNames)).map((row) => row.id)).toEqual([2]);
  });
});
