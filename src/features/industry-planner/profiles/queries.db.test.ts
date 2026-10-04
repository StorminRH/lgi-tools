import { expect, test } from 'vitest';
import { createDbTestHarness, seedUser } from '@/db/__tests__/support/db-test-harness';
import { industryProfiles } from '../schema';
import { emptyProfileDocument } from './profile-document';
import {
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
    expect(await listIndustryProfiles('owner')).toHaveLength(1);
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

test.skipIf(!harness.reachable)(
  'concurrent creates admit exactly the final slot for each account without retaining rejected rows',
  async () => {
    await seedUser(harness.db, 'owner');
    await seedUser(harness.db, 'other');
    await harness.db.insert(industryProfiles).values(
      ['owner', 'other'].flatMap((userId) => Array.from({ length: 19 }, (_, i) => ({
        id: `${userId}-${i}`,
        userId,
        name: `Profile ${i}`,
        document: team,
      }))),
    );

    const results = await Promise.all(['owner', 'other'].map(async (userId) => {
      const attempts = await Promise.all(Array.from({ length: 4 }, (_, i) =>
        createIndustryProfile(userId, { id: `${userId}-contender-${i}`, name: `Contender ${i}`, document: team }),
      ));
      return { userId, attempts };
    }));

    for (const { userId, attempts } of results) {
      expect(attempts.filter(Boolean)).toHaveLength(1);
      expect(attempts.filter((created) => !created)).toHaveLength(3);
      const profiles = await listIndustryProfiles(userId);
      expect(profiles).toHaveLength(20);
      expect(profiles.filter((profile) => profile.id.startsWith(`${userId}-contender-`))).toHaveLength(1);
    }
    const stored = await harness.db.select().from(industryProfiles);
    expect(stored).toHaveLength(40);
    expect(stored.every((profile) => profile.deletedAt === null)).toBe(true);

    await deleteIndustryProfile('owner', 'owner-0');
    expect(await createIndustryProfile('owner', { id: 'replacement', name: 'Replacement', document: team })).toBe(true);
    expect(await listIndustryProfiles('owner')).toHaveLength(20);
    expect(await createIndustryProfile('owner', { id: 'overflow', name: 'Overflow', document: team })).toBe(false);
    expect(await harness.db.select().from(industryProfiles)).toHaveLength(41);
  },
);
