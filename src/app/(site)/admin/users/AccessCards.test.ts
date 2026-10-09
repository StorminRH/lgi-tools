import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@/platform/auth/admin-users';

const mocks = vi.hoisted(() => ({
  admins: vi.fn(),
  owner: vi.fn(),
  search: vi.fn(),
  audit: vi.fn(),
  env: vi.fn(),
}));

vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) => createElement('img', { alt: name }),
}));
vi.mock('../shared-reads', () => ({
  listAdminUsersShared: mocks.admins,
  getUserOwningCharacterShared: mocks.owner,
}));
vi.mock('@/platform/auth/admin-users', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform/auth/admin-users')>()),
  searchUsersByLinkedCharacterName: mocks.search,
}));
vi.mock('@/data/telemetry/queries', () => ({
  getRoleChangeAudit: mocks.audit,
  lastNDaysRange: (days: number) => ({ days }),
}));
vi.mock('@/lib/env', () => ({ readEnv: mocks.env }));

import {
  AccessSearchForm,
  AdminList,
  loadAdminRows,
  loadRoleAudit,
  loadSearchMatches,
  RoleAuditTable,
  SearchMatches,
} from './AccessCards';

function user(overrides: Partial<AdminUser>): AdminUser {
  return { userId: 'u', characterId: 90_000_001, name: 'Pilot', portraitUrl: '', role: 'USER', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.mockReturnValue('90000009');
  mocks.admins.mockResolvedValue([user({ userId: 'a', name: 'Admin Pilot', role: 'ADMIN' })]);
  mocks.owner.mockResolvedValue(user({ userId: 'super', name: 'Super Pilot', characterId: 90_000_009 }));
  mocks.search.mockResolvedValue([user({ userId: 'a', name: 'Admin Pilot', role: 'ADMIN' }), user({ userId: 'c', name: 'Cadet' })]);
  mocks.audit.mockResolvedValue([]);
});

describe('access loads', () => {
  it('lists the env superadmin with the stored admins', async () => {
    const rows = await loadAdminRows();

    expect(rows.map((row) => [row.user.userId, row.isSuperadmin])).toEqual([
      ['super', true],
      ['a', false],
    ]);
    expect(mocks.owner).toHaveBeenCalledWith(90_000_009);
  });

  it('skips the superadmin lookup when none is configured', async () => {
    mocks.env.mockReturnValue(undefined);

    expect(await loadAdminRows()).toHaveLength(1);
    expect(mocks.owner).not.toHaveBeenCalled();
  });

  it('drops admins from search matches and counts the rest', async () => {
    const results = await loadSearchMatches('pil');

    expect(results.nonAdminMatches.map((match) => match.userId)).toEqual(['c']);
    expect(results.resultsHint).toBe('1 match');
    expect(mocks.search).toHaveBeenCalledWith('pil');
  });

  it('reads 90 days of role changes', async () => {
    await loadRoleAudit();

    expect(mocks.audit).toHaveBeenCalledWith({ days: 90 }, 50);
  });
});

describe('AccessSearchForm', () => {
  it('labels the search box for screen readers', () => {
    const html = renderToStaticMarkup(createElement(AccessSearchForm, { query: 'pil' }));

    expect(html).toContain('aria-label="Search by character name"');
    expect(html).toContain('value="pil"');
    expect(html).toContain('Clear');
  });
});

describe('AdminList', () => {
  it('puts the role chip before the action and the env admin has no toggle', async () => {
    const html = renderToStaticMarkup(
      createElement(AdminList, { rows: await loadAdminRows(), viewerUserId: 'viewer', query: undefined }),
    );

    expect(html.indexOf('>Admin<')).toBeLessThan(html.indexOf('Revoke admin'));
    expect(html).toContain('Character ID 90000001');
    expect(html).toContain('managed via env');
    expect(html).toContain('href="/admin/users/a"');
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it('says when there are no admins', () => {
    expect(renderToStaticMarkup(createElement(AdminList, { rows: [], viewerUserId: 'v', query: undefined }))).toContain(
      'No admins currently configured.',
    );
  });
});

describe('SearchMatches', () => {
  it('offers to grant admin to each match, keeping the query', () => {
    const html = renderToStaticMarkup(
      createElement(SearchMatches, { matches: [user({ userId: 'c' })], query: 'cad', viewerUserId: 'v' }),
    );

    expect(html).toContain('Grant admin');
    expect(html).toContain('name="q" value="cad"');
  });

  it('points back to the admin list when only admins match', () => {
    const html = renderToStaticMarkup(createElement(SearchMatches, { matches: [], query: 'cad', viewerUserId: 'v' }));

    expect(html).toContain('No non-admin accounts match');
  });
});

describe('RoleAuditTable', () => {
  it('scrolls sideways inside the card and stamps changes to the minute', () => {
    const html = renderToStaticMarkup(
      createElement(RoleAuditTable, {
        audit: [
          {
            timestamp: new Date('2026-10-08T09:41:30Z'),
            actorName: 'Admin Pilot',
            actorCharacterId: 1,
            targetName: 'Cadet',
            targetCharacterId: 2,
            from: 'USER',
            to: 'ADMIN',
          } as Parameters<typeof RoleAuditTable>[0]['audit'][number],
        ],
      }),
    );

    expect(html).toMatch(/<div class="[^"]*overflow-x-auto[^"]*"><table/);
    expect(html).toContain('2026-10-08 09:41');
  });

  it('says when nothing changed', () => {
    expect(renderToStaticMarkup(createElement(RoleAuditTable, { audit: [] }))).toContain(
      'No role changes in the last 90 days.',
    );
  });
});
