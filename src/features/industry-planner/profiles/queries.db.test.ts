import { expect, test } from 'vitest';
import { createDbTestHarness, seedUser } from '@/db/__tests__/support/db-test-harness';
import { emptyProfileDocument } from './profile-document';
import {
  countIndustryProfiles,
  createIndustryProfile,
  deleteIndustryProfile,
  getIndustryProfileDocument,
  listIndustryProfiles,
  updateIndustryProfile,
} from './queries';

const harness = await createDbTestHarness({
  schema: 'test_industry_profiles',
  tables: ['user', 'industry_profiles'],
  foreignKeys: [
    { table: 'industry_profiles', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

const team = emptyProfileDocument([{ characterId: 9001, name: 'Builder' }]);

test.skipIf(!harness.reachable)(
  'profiles stay per account, revise on each edit, refuse stale edits and keep deleted rows out of the list',
  async () => {
    await seedUser(harness.db, 'owner');
    await seedUser(harness.db, 'stranger');
    await createIndustryProfile('owner', { id: 'caps', name: 'Capitals', document: team });
    await createIndustryProfile('owner', { id: 'rx', name: 'Reactions', document: emptyProfileDocument() });

    // Another account cannot read, edit or delete the owner's profile.
    expect(await listIndustryProfiles('stranger')).toEqual([]);
    expect(await getIndustryProfileDocument('stranger', 'caps')).toBeNull();
    expect(
      await updateIndustryProfile('stranger', { id: 'caps', expectedRevision: 1, name: 'Mine', document: team }),
    ).toBe(false);
    await deleteIndustryProfile('stranger', 'caps');
    expect((await listIndustryProfiles('owner')).map((p) => [p.id, p.name, p.revision])).toEqual([
      ['caps', 'Capitals', 1],
      ['rx', 'Reactions', 1],
    ]);

    expect(
      await updateIndustryProfile('owner', { id: 'caps', expectedRevision: 1, name: 'Capital line', document: team }),
    ).toBe(true);
    // A second writer still holding revision 1 is refused instead of overwriting.
    expect(
      await updateIndustryProfile('owner', { id: 'caps', expectedRevision: 1, name: 'Stale', document: team }),
    ).toBe(false);
    const [caps] = await listIndustryProfiles('owner');
    expect(caps).toMatchObject({ name: 'Capital line', revision: 2, document: team });

    await deleteIndustryProfile('owner', 'rx');
    expect(await countIndustryProfiles('owner')).toBe(1);
    expect(await getIndustryProfileDocument('owner', 'rx')).toBeNull();
    expect(
      await updateIndustryProfile('owner', { id: 'rx', expectedRevision: 1, name: 'Back', document: team }),
    ).toBe(false);
    // The deleted row is kept for later references rather than erased.
    const kept = await harness.sql`select id, deleted_at from industry_profiles where id = 'rx'`;
    expect(kept).toHaveLength(1);
    expect(kept[0]?.deleted_at).not.toBeNull();
  },
);
