import { expect, test } from 'vitest';
import { deriveIdentityChips, forceLogoutDisabled } from './user-detail-view';

test('labels the role, and adds You on the viewing admin\'s own account', () => {
  expect(deriveIdentityChips({ role: 'ADMIN', isSuperadmin: false, isViewerSelf: false })).toEqual([
    { tone: 'purple', label: 'Admin' },
  ]);
  expect(deriveIdentityChips({ role: 'USER', isSuperadmin: false, isViewerSelf: true })).toEqual([
    { tone: 'blue', label: 'User' },
    { tone: 'green', label: 'You' },
  ]);
});

test('shows the effective superadmin role even when the stored role is User', () => {
  expect(deriveIdentityChips({ role: 'USER', isSuperadmin: true, isViewerSelf: true })).toEqual([
    { tone: 'purple', label: 'Superadmin' },
    { tone: 'green', label: 'You' },
  ]);
});

test('disables force logout on your own account or with no sessions', () => {
  expect(forceLogoutDisabled(true, 3)).toBe(true);
  expect(forceLogoutDisabled(false, 0)).toBe(true);
  expect(forceLogoutDisabled(false, 3)).toBe(false);
});
