import { expect, test } from 'vitest';
import { ownerFixture } from '@/platform/owner-sync/__tests__/owner-fixtures';
import { skillsDueKeys, skillsKeys } from './keys';

test('a skills refresh checks both answers of each eligible character and none of the rest', () => {
  const owners = [
    ownerFixture(1),
    ownerFixture(2, { hasRefreshToken: false }),
    ownerFixture(3, { missingScopes: ['esi-skills.read_skillqueue.v1'] }),
    ownerFixture(4),
  ];
  expect(skillsDueKeys(owners)).toEqual([...skillsKeys(1), ...skillsKeys(4)]);
  expect(skillsKeys(1)).toHaveLength(2);
});
