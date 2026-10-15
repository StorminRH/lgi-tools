import { expect, test } from 'vitest';
import { deriveRoleToggle } from './role-toggle-view';

test('deriveRoleToggle flips ADMIN to a revoke and USER to a grant, and marks self rows', () => {
  expect(deriveRoleToggle('ADMIN', 'user-1', 'viewer-1')).toEqual({
    nextRole: 'USER',
    label: 'Revoke admin',
    isSelf: false,
  });
  expect(deriveRoleToggle('USER', 'user-1', 'viewer-1')).toEqual({
    nextRole: 'ADMIN',
    label: 'Grant admin',
    isSelf: false,
  });
  expect(deriveRoleToggle('USER', 'same-id', 'same-id').isSelf).toBe(true);
});
