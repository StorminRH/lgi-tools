import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, onTestFinished, test, vi } from 'vitest';
import { EVE_SCOPES } from '@/config/eve-scopes';
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
vi.mock('@/platform/auth/admin-policy', () => ({ superadminCharacterId: () => 90_000_009 }));

import {
  AccountIdentity,
  LinkedCharacterList,
  readUserDetail,
  SessionsBody,
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

test('readUserDetail starts every read at once and spots the env superadmin among the characters', async () => {
  vi.resetAllMocks();
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

test('readUserDetail leaves a failed read for its card to catch', async () => {
  vi.resetAllMocks();
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

test('shows the account with its effective role and You on your own page', () => {
  const html = renderToStaticMarkup(
    createElement(AccountIdentity, { user: target, isSuperadmin: true, isViewerSelf: true }),
  );

  expect(html).toContain('E2E Pilot');
  expect(html).toContain('Superadmin');
  expect(html).toContain('You');
});

test('lists linked characters with their health, and offers reassign and unlink only where they apply', () => {
  const others = renderToStaticMarkup(
    createElement(LinkedCharacterList, {
      userId: 'target',
      characters: [character(1, { hasRefreshToken: true, scope: 'publicData' }), character(2)],
      activeId: 1,
      isViewerSelf: false,
    }),
  );
  expect(others).toContain('linked 2026-10-08');
  expect(others.match(/Selected/g)).toHaveLength(1);
  expect(others).toContain('Missing scopes');
  expect(others).toContain('Disconnected');
  expect(others.match(/Reassign to me/g)).toHaveLength(2);
  expect(others).not.toMatch(/<button[^>]*disabled=""[^>]*>Unlink/);

  const granted = { hasRefreshToken: true, scope: EVE_SCOPES.join(' ') };
  const delayed = renderToStaticMarkup(
    createElement(LinkedCharacterList, {
      userId: 'target',
      characters: [character(1, { ...granted, authorizationDelayed: true }), character(2, granted)],
      activeId: null,
      isViewerSelf: false,
    }),
  );
  expect(delayed.match(/Verification delayed/g)).toHaveLength(1);
  expect(delayed).not.toContain('Missing scopes');
  expect(delayed).not.toContain('Disconnected');
  expect(delayed).not.toContain('Selected');

  const own = renderToStaticMarkup(
    createElement(LinkedCharacterList, { userId: 'me', characters: [character(1)], activeId: null, isViewerSelf: true }),
  );
  expect(own).not.toContain('Reassign to me');
  expect(own).toMatch(/<button[^>]*disabled=""[^>]*>Unlink/);

  const none = renderToStaticMarkup(
    createElement(LinkedCharacterList, { userId: 'u', characters: [], activeId: null, isViewerSelf: false }),
  );
  expect(none).toContain('No characters linked to this account.');
  expect(none).not.toContain('Unlink');
});

test('counts sessions in the singular and only lets you log others out', () => {
  const one = renderToStaticMarkup(createElement(SessionsBody, { user: target, sessionCount: 1, isViewerSelf: false }));
  const self = renderToStaticMarkup(createElement(SessionsBody, { user: target, sessionCount: 3, isViewerSelf: true }));

  expect(one).toContain('1 unexpired session ·');
  expect(one).not.toMatch(/<button[^>]*disabled=""/);
  expect(self).toContain('3 unexpired sessions');
  expect(self).toMatch(/<button[^>]*disabled=""/);
});
