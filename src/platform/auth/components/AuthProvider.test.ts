import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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

describe('resolveAuthState', () => {
  it('holds a frozen snapshot until the hydration pass has released', () => {
    expect(resolveAuthState(false, SESSION, false)).toEqual({
      session: null,
      isAdmin: false,
      loading: true,
    });
  });

  it('holds while Better Auth is still pending after release', () => {
    expect(resolveAuthState(true, SESSION, true)).toEqual({
      session: null,
      isAdmin: false,
      loading: true,
    });
  });

  it('publishes a signed-in snapshot only once released and settled', () => {
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
  });

  it('publishes signed-out once released and the store is settled empty', () => {
    expect(resolveAuthState(true, null, false)).toEqual({
      session: null,
      isAdmin: false,
      loading: false,
    });
  });

  it('treats a settled row with no active character as signed-out', () => {
    expect(resolveAuthState(true, { ...SESSION, characterId: null }, false)).toEqual({
      session: null,
      isAdmin: false,
      loading: false,
    });
  });
});

// The house suite is node + renderToStaticMarkup (jsdom is deferred). The
// post-commit release is the `released: true` matrix above; these renders
// prove the provider stays on that hold for every server snapshot.
describe('AuthProvider hydration shell', () => {
  it('keeps the server account slot neutral even when the auth store is already settled empty', () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    expect(renderProvider()).toContain('loading:out:user');
  });

  it('keeps the server account slot neutral even when the auth store already has a session', () => {
    useSession.mockReturnValue({ data: SESSION, isPending: false });
    expect(renderProvider()).toContain('loading:out:user');
  });
});
