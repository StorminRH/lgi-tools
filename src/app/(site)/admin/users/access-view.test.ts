import { expect, test } from 'vitest';
import {
  adminRoleBadge,
  deriveAccessView,
  deriveAuditRowView,
  mergeAdminRows,
} from './access-view';
import type { AdminUser } from '@/platform/auth/admin-users';

function admin(overrides: Partial<AdminUser>): AdminUser {
  return {
    userId: 'u1',
    characterId: 100,
    name: 'Pilot',
    portraitUrl: 'https://img/1.png',
    role: 'USER',
    ...overrides,
  };
}

test('mergeAdminRows flags or prepends the env superadmin and tones role badges', () => {
  const flagged = mergeAdminRows(
    [admin({ userId: 'a', role: 'ADMIN' }), admin({ userId: 'b', role: 'ADMIN' })],
    admin({ userId: 'b' }),
  );
  expect(flagged.map((r) => [r.user.userId, r.isSuperadmin])).toEqual([
    ['a', false],
    ['b', true],
  ]);

  const prepended = mergeAdminRows([admin({ userId: 'a', role: 'ADMIN' })], admin({ userId: 'super' }));
  expect(prepended[0]).toEqual({
    user: expect.objectContaining({ userId: 'super' }),
    isSuperadmin: true,
  });
  expect(prepended).toHaveLength(2);

  expect(mergeAdminRows([admin({ userId: 'a', role: 'ADMIN' })], null)).toEqual([
    { user: expect.objectContaining({ userId: 'a' }), isSuperadmin: false },
  ]);

  expect(adminRoleBadge({ isSuperadmin: true, role: 'USER' })).toEqual({
    tone: 'purple',
    label: 'Superadmin',
  });
  expect(adminRoleBadge({ isSuperadmin: false, role: 'ADMIN' })).toEqual({
    tone: 'purple',
    label: 'Admin',
  });
  expect(adminRoleBadge({ isSuperadmin: false, role: 'USER' })).toEqual({
    tone: 'blue',
    label: 'User',
  });
});

test('deriveAuditRowView labels actor/target with id fallbacks and tones the role pills', () => {
  const named = deriveAuditRowView({
    timestamp: new Date('2026-06-09T00:00:00Z'),
    actorName: 'Actor',
    actorCharacterId: 1,
    targetName: null,
    targetCharacterId: 2,
    from: 'USER',
    to: 'ADMIN',
  } as Parameters<typeof deriveAuditRowView>[0]);
  expect(named.timestamp).toBe('2026-06-09 00:00');
  expect(named.actorLabel).toBe('Actor');
  expect(named.targetLabel).toBe('Character 2');
  expect(named.fromTone).toBe('blue');
  expect(named.toTone).toBe('purple');
  expect(named.toLabel).toBe('ADMIN');

  const missing = deriveAuditRowView({
    timestamp: new Date('2026-06-09T00:00:00Z'),
    actorName: null,
    actorCharacterId: null,
    targetName: null,
    targetCharacterId: null,
    from: null,
    to: null,
  } as Parameters<typeof deriveAuditRowView>[0]);
  expect(missing.actorLabel).toBe('Unknown actor');
  expect(missing.fromLabel).toBe('?');
});

test('deriveAccessView filters admins from search, and says when the list stops at the cap', () => {
  const adminRows = [{ user: { userId: 'a' } }, { user: { userId: 'b' } }];
  const searched = deriveAccessView({
    adminRows,
    searchResults: [admin({ userId: 'a' }), admin({ userId: 'c' })],
  });
  expect(searched.nonAdminMatches.map((u) => u.userId)).toEqual(['c']);
  expect(searched.resultsHint).toBe('1 match');

  const many = Array.from({ length: 51 }, (_, i) => admin({ userId: `x${i}` }));
  const truncated = deriveAccessView({ adminRows: [], searchResults: many });
  expect(truncated.nonAdminMatches).toHaveLength(50);
  expect(truncated.resultsHint).toBe('50 matches · showing first 50, narrow your search');

  expect(deriveAccessView({ adminRows, searchResults: [] }).resultsHint).toBe('0 matches');
});
