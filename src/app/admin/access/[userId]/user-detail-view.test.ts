import { describe, expect, it } from 'vitest';
import type { AdminUser } from '@/features/auth/queries';
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

describe('deriveUserDetailView', () => {
  it('labels the character id and falls back to an em dash when absent', () => {
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
  });

  it('shows the admin role chip and no You chip when viewing another user', () => {
    const result = view({
      targetUser: adminUser({ role: 'ADMIN' }),
      charactersCount: 2,
      sessionCount: 1,
      viewerUserId: 'admin',
      userId: 'target',
    });
    expect(result.identityChips).toEqual([{ tone: 'purple', label: 'Admin' }]);
    expect(result.isViewerSelf).toBe(false);
  });

  it('uses the user role chip and appends a You chip when viewing own account', () => {
    const result = view({
      targetUser: adminUser({ role: 'USER' }),
      charactersCount: 3,
      sessionCount: 2,
      viewerUserId: 'me',
      userId: 'me',
    });
    expect(result.identityChips).toEqual([
      { tone: 'blue', label: 'User' },
      { tone: 'green', label: 'You' },
    ]);
    expect(result.isViewerSelf).toBe(true);
  });

  it('flags the only-character case at one or fewer linked characters', () => {
    const base = { targetUser: adminUser(), sessionCount: 1, viewerUserId: 'v', userId: 'u' };
    expect(view({ ...base, charactersCount: 1 }).isOnlyCharacter).toBe(true);
    expect(view({ ...base, charactersCount: 0 }).isOnlyCharacter).toBe(true);
    expect(view({ ...base, charactersCount: 2 }).isOnlyCharacter).toBe(false);
  });

  it('disables force-logout when viewing self or when no sessions are active', () => {
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
});
