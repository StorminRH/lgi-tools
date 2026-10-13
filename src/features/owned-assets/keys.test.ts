import { expect, test } from 'vitest';
import { ownerFixture } from '@/platform/owner-sync/__tests__/owner-fixtures';
import { characterAssetsDueKeys, ownedAssetsDueKeys, ownedAssetsKey } from './keys';

const owners = [
  ownerFixture(1, { corporationId: 5000 }),
  ownerFixture(2, { corporationId: 5000, missingScopes: ['esi-assets.read_corporation_assets.v1'] }),
  ownerFixture(3, { corporationId: 6000, missingScopes: ['esi-assets.read_assets.v1'] }),
  ownerFixture(4, { hasRefreshToken: false }),
];

test('the board\'s personal-assets refresh checks the eligible characters\' answers only', () => {
  expect(characterAssetsDueKeys(owners)).toEqual([
    ownedAssetsKey({ ownerType: 'character', ownerId: 1 }),
    ownedAssetsKey({ ownerType: 'character', ownerId: 2 }),
  ]);
});

test('a full owned-assets refresh adds one answer per corporation an eligible member belongs to', () => {
  // The corp read has its own scope: a pilot without the personal one can still be the corp's reader.
  expect(ownedAssetsDueKeys(owners)).toEqual([
    ownedAssetsKey({ ownerType: 'character', ownerId: 1 }),
    ownedAssetsKey({ ownerType: 'character', ownerId: 2 }),
    ownedAssetsKey({ ownerType: 'corporation', ownerId: 5000 }),
    ownedAssetsKey({ ownerType: 'corporation', ownerId: 6000 }),
  ]);
});
