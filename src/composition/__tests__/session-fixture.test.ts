import { expect, test } from 'vitest';
import { adminSessionFixture, sessionFixture } from './session-fixture';

test('the admin fixture is an admin on both the enriched identity and the user record, and overrides still win', () => {
  expect(adminSessionFixture({ characterId: 1 })).toMatchObject({
    characterId: 1,
    role: 'ADMIN',
    isAdmin: true,
    user: { role: 'ADMIN', activeCharacterId: 1 },
  });
  expect(sessionFixture()).toMatchObject({ role: 'USER', isAdmin: false, user: { role: 'USER' } });
  expect(adminSessionFixture({ isAdmin: false })).toMatchObject({ role: 'ADMIN', isAdmin: false });
});

test('a user id override also moves the better-auth session record to that user', () => {
  const session = sessionFixture({ user: { id: 'account-a' } });

  expect(session.user.id).toBe('account-a');
  expect(session.session.userId).toBe('account-a');
  expect(sessionFixture().session.userId).toBe('eve-user-1');
});
