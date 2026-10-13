import { expect, test } from 'vitest';
import { ownerFixture } from '@/platform/owner-sync/__tests__/owner-fixtures';
import { ownedBlueprintsDueKeys, ownedBlueprintsKey } from './keys';

test('an owned-blueprints refresh checks eligible characters and the corporations of eligible members', () => {
  const owners = [
    ownerFixture(1, { corporationId: 5000 }),
    ownerFixture(2, { corporationId: 6000, missingScopes: ['esi-corporations.read_blueprints.v1'] }),
    ownerFixture(3, { hasRefreshToken: false }),
  ];
  expect(ownedBlueprintsDueKeys(owners)).toEqual([
    ownedBlueprintsKey({ ownerType: 'character', ownerId: 1 }),
    ownedBlueprintsKey({ ownerType: 'character', ownerId: 2 }),
    ownedBlueprintsKey({ ownerType: 'corporation', ownerId: 5000 }),
  ]);
});
