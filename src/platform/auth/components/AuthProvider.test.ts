import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));

vi.mock('../auth-client', () => ({
  authClient: { useSession },
}));

import { AuthProvider, useAuth } from './AuthProvider';

function AuthStateProbe() {
  const { loading, session } = useAuth();
  return createElement('span', null, `${loading ? 'loading' : 'settled'}:${session ? 'in' : 'out'}`);
}

describe('AuthProvider hydration shell', () => {
  it('keeps the server account slot neutral even when the auth store is already settled empty', () => {
    useSession.mockReturnValue({ data: null, isPending: false });

    const html = renderToStaticMarkup(
      createElement(AuthProvider, null, createElement(AuthStateProbe)),
    );

    expect(html).toContain('loading:out');
  });
});
