import { describe, expect, it } from 'vitest';
import { account } from '@/db/auth-schema';
import {
  createDbTestHarness,
  seedCharacter,
  seedEveAccount,
  seedUser,
} from '@/db/test-support/db-test-harness';
import {
  getUserIdsInCorporations,
  getUserIdsOwningCharacters,
} from './queries';

const harness = await createDbTestHarness({
  schema: 'test_maps_queries',
  tables: ['user', 'account', 'characters'],
  foreignKeys: [
    {
      table: 'account',
      column: 'user_id',
      refTable: 'user',
      refColumn: 'id',
      onDelete: 'cascade',
    },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

describe.skipIf(!harness.reachable)('maps candidate queries (real Postgres)', () => {
  it('resolves EVE-provider owners by character id and ignores non-EVE rows', async () => {
    await seedUser(harness.db, 'owner');
    await seedUser(harness.db, 'other');
    await seedEveAccount(harness.db, { id: 'acc-1', characterId: 42, userId: 'owner' });
    await seedEveAccount(harness.db, { id: 'acc-2', characterId: 43, userId: 'other' });
    await harness.db.insert(account).values({
      id: 'acc-discord',
      accountId: '42',
      providerId: 'discord',
      userId: 'owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(getUserIdsOwningCharacters([42, 43, 99])).resolves.toEqual(
      new Map([
        [42, 'owner'],
        [43, 'other'],
      ]),
    );
  });

  it('returns an empty map without querying when character ids are empty', async () => {
    await expect(getUserIdsOwningCharacters([])).resolves.toEqual(new Map());
  });

  it('resolves users with a linked character in granted corporations', async () => {
    await seedUser(harness.db, 'member');
    await seedUser(harness.db, 'outsider');
    await seedCharacter(harness.db, 42, { corporationId: 990 });
    await seedCharacter(harness.db, 43, { corporationId: 991 });
    await seedEveAccount(harness.db, { id: 'acc-1', characterId: 42, userId: 'member' });
    await seedEveAccount(harness.db, { id: 'acc-2', characterId: 43, userId: 'outsider' });

    await expect(getUserIdsInCorporations([990])).resolves.toEqual(new Set(['member']));
  });

  it('returns an empty set without querying when corporation ids are empty', async () => {
    await expect(getUserIdsInCorporations([])).resolves.toEqual(new Set());
  });
});
