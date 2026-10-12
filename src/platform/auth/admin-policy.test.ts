import { afterEach, expect, test, vi } from 'vitest';
import { isAdminIdentity, normalizeCharacterRole, superadminCharacterId } from './admin-policy';

afterEach(() => vi.unstubAllEnvs());

test('reads the superadmin only from a positive whole-number SUPERADMIN_CHARACTER_ID', () => {
  vi.stubEnv('SUPERADMIN_CHARACTER_ID', undefined);
  expect(superadminCharacterId()).toBeNull();

  for (const raw of ['', 'not-a-number', '0', '-1', '1.5', '1e400']) {
    vi.stubEnv('SUPERADMIN_CHARACTER_ID', raw);
    expect(superadminCharacterId(), raw).toBeNull();
  }

  vi.stubEnv('SUPERADMIN_CHARACTER_ID', '1000000000');
  expect(superadminCharacterId()).toBe(1_000_000_000);
});

test('grants admin to the ADMIN role and to the env superadmin, never through an unset or garbage id', () => {
  vi.stubEnv('SUPERADMIN_CHARACTER_ID', '1000000000');
  expect(isAdminIdentity(12345, 'USER')).toBe(false);
  expect(isAdminIdentity(67890, 'ADMIN')).toBe(true);
  expect(isAdminIdentity(1_000_000_000, 'USER')).toBe(true);
  expect(isAdminIdentity(null, 'ADMIN')).toBe(true);
  expect(isAdminIdentity(null, 'USER')).toBe(false);

  vi.stubEnv('SUPERADMIN_CHARACTER_ID', '');
  expect(isAdminIdentity(12345, 'USER')).toBe(false);
  expect(isAdminIdentity(67890, 'ADMIN')).toBe(true);

  vi.stubEnv('SUPERADMIN_CHARACTER_ID', 'not-a-number');
  expect(isAdminIdentity(12345, 'USER')).toBe(false);
  expect(isAdminIdentity(67890, 'ADMIN')).toBe(true);

  vi.stubEnv('SUPERADMIN_CHARACTER_ID', '0');
  expect(isAdminIdentity(0, 'USER')).toBe(false);
});

test('reads a missing or unknown role as USER', () => {
  expect(normalizeCharacterRole(undefined)).toBe('USER');
  expect(normalizeCharacterRole(null)).toBe('USER');
  expect(normalizeCharacterRole('ADMIN')).toBe('ADMIN');
  expect(normalizeCharacterRole('SUPERUSER')).toBe('USER');
  expect(normalizeCharacterRole('admin')).toBe('USER');
});
