import { expect, test, vi } from 'vitest';
import { deriveSessionIdentity } from './session-identity';
import type { ActiveCharacter } from './linked-characters';

const baseUser = { id: 'u1', role: 'USER', name: 'User Name', image: 'user-image.png' };
const baseSession = { id: 's1' };
const notAdmin = () => false;

test('derives identity from the active character and falls back to the user row', () => {
  const active: ActiveCharacter = { characterId: 42, name: 'Pilot', portraitUrl: 'pilot.png' };
  const fromCharacter = deriveSessionIdentity({
    user: baseUser,
    session: baseSession,
    active,
    isAdmin: notAdmin,
  });
  expect(fromCharacter.characterId).toBe(42);
  expect(fromCharacter.name).toBe('Pilot');
  expect(fromCharacter.portraitUrl).toBe('pilot.png');

  const fromUser = deriveSessionIdentity({
    user: baseUser,
    session: baseSession,
    active: null,
    isAdmin: notAdmin,
  });
  expect(fromUser.characterId).toBeNull();
  expect(fromUser.name).toBe('User Name');
  expect(fromUser.portraitUrl).toBe('user-image.png');

  const unwritten: ActiveCharacter = { characterId: 7, name: null, portraitUrl: null };
  const fallback = deriveSessionIdentity({
    user: baseUser,
    session: baseSession,
    active: unwritten,
    isAdmin: notAdmin,
  });
  expect(fallback.characterId).toBe(7);
  expect(fallback.name).toBe('User Name');
  expect(fallback.portraitUrl).toBe('user-image.png');

  expect(
    deriveSessionIdentity({
      user: { ...baseUser, image: null },
      session: baseSession,
      active: null,
      isAdmin: notAdmin,
    }).portraitUrl,
  ).toBe('');
});

test('defaults a missing role to USER and feeds characterId + role to the injected isAdmin', () => {
  expect(
    deriveSessionIdentity({
      user: { id: 'u2', name: 'No Role', image: null },
      session: baseSession,
      active: null,
      isAdmin: notAdmin,
    }).role,
  ).toBe('USER');

  const isAdmin = vi.fn(() => true);
  const active: ActiveCharacter = { characterId: 99, name: 'Boss', portraitUrl: 'boss.png' };
  const out = deriveSessionIdentity({
    user: { ...baseUser, role: 'ADMIN' },
    session: baseSession,
    active,
    isAdmin,
  });
  expect(isAdmin).toHaveBeenCalledWith(99, 'ADMIN');
  expect(out.isAdmin).toBe(true);
});
