import { expect, test } from 'vitest';
import type { AdminUser } from '@/platform/auth/admin-users';
import { deriveUserDetailView } from './user-detail-view';

const adminUser = (over: Partial<AdminUser> = {}): AdminUser => ({
  userId: 'u1',
  characterId: 95_465_499,
  name: 'Test Pilot',
  portraitUrl: 'https://images.evetech.net/characters/95465499/portrait',
  role: 'USER',
  ...over,
});

const view = (over: Parameters<typeof deriveUserDetailView>[0]) => deriveUserDetailView(over);

test('labels identity chips for self vs other and falls back when the character id is absent', () => {
  expect(
    view({
      targetUser: adminUser({ characterId: 90_000_001 }),
      charactersCount: 2,
      sessionCount: 1,
      viewerUserId: 'v1',
      userId: 'u1',
    }).characterIdLabel,
  ).toBe('90000001');
  expect(
    view({
      targetUser: adminUser({ characterId: null }),
      charactersCount: 2,
      sessionCount: 1,
      viewerUserId: 'v1',
      userId: 'u1',
    }).characterIdLabel,
  ).toBe('—');

  const other = view({
    targetUser: adminUser({ role: 'ADMIN' }),
    charactersCount: 2,
    sessionCount: 1,
    viewerUserId: 'admin',
    userId: 'target',
  });
  expect(other.identityChips).toEqual([{ tone: 'purple', label: 'Admin' }]);
  expect(other.isViewerSelf).toBe(false);

  const self = view({
    targetUser: adminUser({ role: 'USER' }),
    charactersCount: 3,
    sessionCount: 2,
    viewerUserId: 'me',
    userId: 'me',
  });
  expect(self.identityChips).toEqual([
    { tone: 'blue', label: 'User' },
    { tone: 'green', label: 'You' },
  ]);
  expect(self.isViewerSelf).toBe(true);
});

test('disables last-character unlink and self or empty-session force-logout', () => {
  const base = { targetUser: adminUser(), sessionCount: 1, viewerUserId: 'v', userId: 'u' };
  expect(view({ ...base, charactersCount: 1 }).isOnlyCharacter).toBe(true);
  expect(view({ ...base, charactersCount: 0 }).isOnlyCharacter).toBe(true);
  expect(view({ ...base, charactersCount: 2 }).isOnlyCharacter).toBe(false);

  expect(
    view({
      targetUser: adminUser(),
      charactersCount: 2,
      sessionCount: 3,
      viewerUserId: 'me',
      userId: 'me',
    }).forceLogoutDisabled,
  ).toBe(true);
  expect(
    view({
      targetUser: adminUser(),
      charactersCount: 2,
      sessionCount: 0,
      viewerUserId: 'admin',
      userId: 'target',
    }).forceLogoutDisabled,
  ).toBe(true);
  expect(
    view({
      targetUser: adminUser(),
      charactersCount: 2,
      sessionCount: 3,
      viewerUserId: 'admin',
      userId: 'target',
    }).forceLogoutDisabled,
  ).toBe(false);
});
