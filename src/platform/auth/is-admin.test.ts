import { afterEach, expect, test, vi } from 'vitest';

vi.mock('./auth', () => ({ auth: { api: { getSession: vi.fn() } } }));

import { isAdmin } from './session';
import type { Session } from './types';

const userSession: Session = {
  characterId: 12345,
  name: 'Test User',
  portraitUrl: 'https://images.evetech.net/characters/12345/portrait?size=128',
  role: 'USER',
};

const adminSession: Session = {
  characterId: 67890,
  name: 'Test Admin',
  portraitUrl: 'https://images.evetech.net/characters/67890/portrait?size=128',
  role: 'ADMIN',
};

const superSession: Session = {
  characterId: 1000000000,
  name: 'Test Pilot',
  portraitUrl: 'https://images.evetech.net/characters/1000000000/portrait?size=128',
  role: 'USER',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

test('isAdmin grants DB-ADMIN and env superadmin, never via unset or garbage SUPERADMIN_CHARACTER_ID', () => {
  expect(isAdmin(null)).toBe(false);

  vi.stubEnv('SUPERADMIN_CHARACTER_ID', '1000000000');
  expect(isAdmin(userSession)).toBe(false);
  expect(isAdmin(adminSession)).toBe(true);
  expect(isAdmin(superSession)).toBe(true);

  vi.stubEnv('SUPERADMIN_CHARACTER_ID', '');
  expect(isAdmin(userSession)).toBe(false);
  expect(isAdmin(adminSession)).toBe(true);

  vi.stubEnv('SUPERADMIN_CHARACTER_ID', 'not-a-number');
  expect(isAdmin(userSession)).toBe(false);
  expect(isAdmin(adminSession)).toBe(true);
});
