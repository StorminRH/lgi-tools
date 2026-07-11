import { describe, it, expect } from 'vitest';
import {
  adminRoleBadge,
  deriveAccessView,
  deriveAuditRowView,
  formatDateTime,
  mergeAdminRows,
} from './access-view';
import type { AdminUser } from '@/features/auth/queries';

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

describe('formatDateTime', () => {
  it('renders "YYYY-MM-DD HH:MM" in UTC', () => {
    expect(formatDateTime(new Date('2026-06-09T12:34:56.789Z'))).toBe('2026-06-09 12:34');
  });
});

describe('mergeAdminRows', () => {
  it('flags the DB admin who owns the env superadmin user', () => {
    const dbAdmins = [admin({ userId: 'a', role: 'ADMIN' }), admin({ userId: 'b', role: 'ADMIN' })];
    const rows = mergeAdminRows(dbAdmins, admin({ userId: 'b' }));
    expect(rows.map((r) => [r.user.userId, r.isSuperadmin])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it('prepends the superadmin when they are not already a DB admin', () => {
    const rows = mergeAdminRows([admin({ userId: 'a', role: 'ADMIN' })], admin({ userId: 'super' }));
    expect(rows[0]).toEqual({ user: expect.objectContaining({ userId: 'super' }), isSuperadmin: true });
    expect(rows).toHaveLength(2);
  });

  it('no env superadmin → just the DB admins, none flagged', () => {
    const rows = mergeAdminRows([admin({ userId: 'a', role: 'ADMIN' })], null);
    expect(rows).toEqual([{ user: expect.objectContaining({ userId: 'a' }), isSuperadmin: false }]);
  });
});

describe('adminRoleBadge', () => {
  it('superadmin and admin are purple; a plain user is blue', () => {
    expect(adminRoleBadge({ isSuperadmin: true, role: 'USER' })).toEqual({ tone: 'purple', label: 'Superadmin' });
    expect(adminRoleBadge({ isSuperadmin: false, role: 'ADMIN' })).toEqual({ tone: 'purple', label: 'Admin' });
    expect(adminRoleBadge({ isSuperadmin: false, role: 'USER' })).toEqual({ tone: 'blue', label: 'User' });
  });
});

describe('deriveAuditRowView', () => {
  it('labels actor/target with id fallbacks and tones the role pills', () => {
    const view = deriveAuditRowView({
      timestamp: new Date('2026-06-09T00:00:00Z'),
      actorName: 'Actor',
      actorCharacterId: 1,
      targetName: null,
      targetCharacterId: 2,
      from: 'USER',
      to: 'ADMIN',
    } as Parameters<typeof deriveAuditRowView>[0]);
    expect(view.actorLabel).toBe('Actor');
    expect(view.targetLabel).toBe('id 2'); // name null → id fallback
    expect(view.fromTone).toBe('blue');
    expect(view.toTone).toBe('purple');
    expect(view.toLabel).toBe('ADMIN');
  });

  it('falls back to "?" when both name and id are absent', () => {
    const view = deriveAuditRowView({
      timestamp: new Date('2026-06-09T00:00:00Z'),
      actorName: null,
      actorCharacterId: null,
      targetName: null,
      targetCharacterId: null,
      from: null,
      to: null,
    } as Parameters<typeof deriveAuditRowView>[0]);
    expect(view.actorLabel).toBe('id ?');
    expect(view.fromLabel).toBe('?');
  });
});

describe('deriveAccessView', () => {
  const adminRows = [{ user: { userId: 'a' } }, { user: { userId: 'b' } }];

  it('filters admins out of search results and counts non-admin matches', () => {
    const view = deriveAccessView({
      adminRows,
      searchResults: [admin({ userId: 'a' }), admin({ userId: 'c' })],
      query: 'pil',
    });
    expect(view.nonAdminMatches.map((u) => u.userId)).toEqual(['c']);
    expect(view.hasQuery).toBe(true);
    expect(view.querySuffix).toBe(' · search "pil"');
    expect(view.resultsHint).toBe('1 match');
  });

  it('flags truncation when the search returns one past the cap', () => {
    const many = Array.from({ length: 51 }, (_, i) => admin({ userId: `x${i}` }));
    const view = deriveAccessView({ adminRows: [], searchResults: many, query: 'x' });
    expect(view.searchTruncated).toBe(true);
    expect(view.nonAdminMatches).toHaveLength(50); // capped
    expect(view.resultsHint).toContain('showing first 50');
  });

  it('no query → singular admin plural and no suffix', () => {
    const view = deriveAccessView({ adminRows: [{ user: { userId: 'a' } }], searchResults: [], query: undefined });
    expect(view.adminCount).toBe(1);
    expect(view.adminPlural).toBe('');
    expect(view.querySuffix).toBe('');
    expect(view.hasQuery).toBe(false);
  });
});
