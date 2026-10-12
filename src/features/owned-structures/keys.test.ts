import { expect, test } from 'vitest';
import { ownerFixture } from '@/platform/owner-sync/__tests__/owner-fixtures';
import { corpStructuresDueKeys, corpStructuresKey } from './keys';

test('a corp structures refresh checks one answer per corporation an eligible member belongs to', () => {
  const owners = [
    ownerFixture(1, { corporationId: 5000 }),
    ownerFixture(2, { corporationId: 5000 }),
    ownerFixture(3, { corporationId: 6000, missingScopes: ['esi-corporations.read_structures.v1'] }),
    ownerFixture(4),
  ];
  expect(corpStructuresDueKeys(owners)).toEqual([corpStructuresKey(5000)]);
  expect(corpStructuresDueKeys([])).toEqual([]);
});
