import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock('@/platform/auth/components/AuthProvider', () => ({ useAuth }));

import { SignedInFold } from './SignedInFold';

function render(): string {
  return renderToStaticMarkup(createElement(SignedInFold, null, createElement('p', null, 'pitch')));
}

test('folds the pitch once a session settles and leaves it open while auth is loading or signed out', () => {
  useAuth.mockReturnValue({ session: null, isAdmin: false, loading: true });
  const loading = render();
  expect(loading).toContain('<p>pitch</p>');
  expect(loading).not.toContain('data-folded');
  expect(loading).not.toContain('data-settled');
  expect(loading).toContain('<script type="text/javascript">');
  expect(loading).toContain('localStorage.getItem("lgi:signed-in")');
  expect(loading).toContain('data-signed-in-hint');

  useAuth.mockReturnValue({
    session: { characterId: 1, name: 'Pilot', portraitUrl: '', role: 'USER' },
    isAdmin: false,
    loading: false,
  });
  const signedIn = render();
  expect(signedIn).toContain('data-folded="true"');
  expect(signedIn).toContain('data-settled=""');
  expect(signedIn).toContain('aria-hidden="true"');
  expect(signedIn).toContain('inert=""');

  useAuth.mockReturnValue({ session: null, isAdmin: false, loading: false });
  const signedOut = render();
  expect(signedOut).toContain('data-settled=""');
  expect(signedOut).not.toContain('data-folded');
  expect(signedOut).not.toContain('aria-hidden');
});
