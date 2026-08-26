import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { resolveAuthState } from './auth-state';

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));

vi.mock('../auth-client', () => ({
  authClient: { useSession },
}));

import { AuthProvider, useAuth } from './AuthProvider';

const SESSION = {
  characterId: 90000001,
  name: 'Pilot',
  portraitUrl: 'https://img/pilot.jpg',
  role: 'USER' as const,
  isAdmin: false,
};

function AuthStateProbe() {
  const { loading, session, isAdmin } = useAuth();
  return createElement(
    'span',
    null,
    `${loading ? 'loading' : 'settled'}:${session ? 'in' : 'out'}:${isAdmin ? 'admin' : 'user'}`,
  );
}

function renderProvider(): string {
  return renderToStaticMarkup(
    createElement(AuthProvider, null, createElement(AuthStateProbe)),
  );
}

test('resolveAuthState holds a frozen snapshot until release, then publishes signed-in or signed-out', () => {
  expect(resolveAuthState(false, SESSION, false)).toEqual({
    session: null,
    isAdmin: false,
    loading: true,
  });
  expect(resolveAuthState(true, SESSION, true)).toEqual({
    session: null,
    isAdmin: false,
    loading: true,
  });
  expect(resolveAuthState(true, { ...SESSION, isAdmin: true }, false)).toEqual({
    session: {
      characterId: SESSION.characterId,
      name: SESSION.name,
      portraitUrl: SESSION.portraitUrl,
      role: SESSION.role,
    },
    isAdmin: true,
    loading: false,
  });
  expect(resolveAuthState(true, null, false)).toEqual({
    session: null,
    isAdmin: false,
    loading: false,
  });
  expect(resolveAuthState(true, { ...SESSION, characterId: null }, false)).toEqual({
    session: null,
    isAdmin: false,
    loading: false,
  });
});

test('AuthProvider hydration shell stays on the hold for every server snapshot', () => {
  useSession.mockReturnValue({ data: null, isPending: false });
  expect(renderProvider()).toContain('loading:out:user');

  useSession.mockReturnValue({ data: SESSION, isPending: false });
  expect(renderProvider()).toContain('loading:out:user');
});
