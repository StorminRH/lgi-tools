import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { AdminUser } from '@/platform/auth/admin-users';
import type { LinkedCharacter } from '@/platform/auth/linked-characters';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  sessions: vi.fn(),
  characters: vi.fn(),
  activeId: vi.fn(),
}));

vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) => createElement('img', { alt: name }),
}));
vi.mock('@/platform/auth/admin-users', () => ({
  getUserById: mocks.user,
  getActiveSessionCount: mocks.sessions,
}));
vi.mock('@/platform/auth/linked-characters', () => ({
  listLinkedCharacters: mocks.characters,
  getStoredActiveCharacterId: mocks.activeId,
}));
vi.mock('@/lib/env', () => ({ readEnv: () => '90000009' }));

import {
  AccountIdentity,
  AccountUnavailable,
  LinkedCharacterList,
  readUserDetail,
  SessionsBody,
  UserNotFound,
} from './UserDetailCards';

const target: AdminUser = {
  userId: 'target',
  characterId: 90_000_001,
  name: 'E2E Pilot',
  portraitUrl: '',
  role: 'ADMIN',
};

function character(characterId: number, overrides: Partial<LinkedCharacter> = {}): LinkedCharacter {
  return {
    characterId,
    name: `Pilot ${characterId}`,
    portraitUrl: '',
    scope: null,
    hasRefreshToken: false,
    linkedAt: new Date('2026-10-08T10:00:00Z'),
    corporationId: null,
    allianceId: null,
    affiliationRefreshedAt: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('readUserDetail', () => {
  it('starts every read at once and spots the env superadmin among the characters', async () => {
    mocks.user.mockResolvedValue(target);
    mocks.characters.mockResolvedValue([character(90_000_001), character(90_000_009)]);
    mocks.activeId.mockResolvedValue(90_000_001);
    mocks.sessions.mockResolvedValue(2);

    const reads = readUserDetail('target');

    for (const read of [mocks.user, mocks.characters, mocks.activeId, mocks.sessions]) {
      expect(read).toHaveBeenCalledWith('target');
    }
    await expect(reads.superadmin).resolves.toBe(true);
    await expect(reads.sessions).resolves.toBe(2);
  });

  it('leaves a failed read for its card to catch', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    onTestFinished(() => {
      process.off('unhandledRejection', unhandled);
    });
    mocks.user.mockResolvedValue(target);
    mocks.characters.mockRejectedValue(new Error('offline'));
    mocks.activeId.mockResolvedValue(null);
    mocks.sessions.mockResolvedValue(0);

    const reads = readUserDetail('target');
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(reads.characters).rejects.toThrow('offline');
    await expect(reads.superadmin).rejects.toThrow('offline');
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe('user detail cards', () => {
  it('keeps the not-found and unavailable states in their own cards', () => {
    expect(renderToStaticMarkup(createElement(UserNotFound))).toContain('No account matches that id.');
    expect(renderToStaticMarkup(createElement(AccountUnavailable))).toContain('Unable to load this account.');
  });

  it('shows the account with its effective role and You on your own page', () => {
    const html = renderToStaticMarkup(
      createElement(AccountIdentity, { user: target, isSuperadmin: true, isViewerSelf: true }),
    );

    expect(html).toContain('E2E Pilot');
    expect(html).toContain('Character ID 90000001');
    expect(html).toContain('Superadmin');
    expect(html).toContain('You');
  });

  it('puts status chips before actions and offers reassignment on someone else\'s account', () => {
    const html = renderToStaticMarkup(
      createElement(LinkedCharacterList, {
        userId: 'target',
        characters: [character(1, { hasRefreshToken: true, scope: 'publicData' }), character(2)],
        activeId: 1,
        isViewerSelf: false,
      }),
    );

    expect(html).toContain('Character ID 1');
    expect(html).toContain('linked 2026-10-08');
    expect(html.indexOf('Selected')).toBeLessThan(html.indexOf('Reassign to me'));
    expect(html).toContain('Missing scopes');
    expect(html).toContain('Disconnected');
    expect(html.match(/Reassign to me/g)).toHaveLength(2);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Unlink/);
  });

  it('does not offer to reassign your own characters, nor to unlink the last one', () => {
    const html = renderToStaticMarkup(
      createElement(LinkedCharacterList, {
        userId: 'me',
        characters: [character(1)],
        activeId: null,
        isViewerSelf: true,
      }),
    );

    expect(html).not.toContain('Reassign to me');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Unlink/);
  });

  it('says when no characters are linked', () => {
    const html = renderToStaticMarkup(
      createElement(LinkedCharacterList, { userId: 'u', characters: [], activeId: null, isViewerSelf: false }),
    );

    expect(html).toContain('No characters linked to this account.');
  });

  it('counts sessions in the singular and only lets you log others out', () => {
    const one = renderToStaticMarkup(createElement(SessionsBody, { user: target, sessionCount: 1, isViewerSelf: false }));
    const self = renderToStaticMarkup(createElement(SessionsBody, { user: target, sessionCount: 3, isViewerSelf: true }));

    expect(one).toContain('1 unexpired session · logout may take a few minutes.');
    expect(one).not.toMatch(/<button[^>]*disabled=""/);
    expect(self).toContain('3 unexpired sessions');
    expect(self).toMatch(/<button[^>]*disabled=""/);
  });
});
