import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock('@/platform/auth/components/AuthProvider', () => ({ useAuth }));

import { HomeHeroPitch } from './HomeHeroPitch';

const SIGNED_IN = {
  session: { characterId: 1, name: 'Pilot', portraitUrl: '', role: 'USER' },
  isAdmin: false,
  loading: false,
};

function render(): string {
  return renderToStaticMarkup(createElement(HomeHeroPitch, null, createElement('p', null, 'pitch')));
}

test('server HTML shows the pitch unsettled and carries the pre-paint hint script', () => {
  useAuth.mockReturnValue({ session: null, isAdmin: false, loading: true });
  const html = render();
  expect(html).toContain('<p>pitch</p>');
  expect(html).not.toContain('data-folded');
  expect(html).not.toContain('data-settled');
  expect(html).toContain('<script type="text/javascript">');
  expect(html).toContain('localStorage.getItem("lgi:signed-in")');
  expect(html).toContain('data-signed-in-hint');
});

test('a settled signed-in session folds the pitch and hides it from assistive tech', () => {
  useAuth.mockReturnValue(SIGNED_IN);
  const html = render();
  expect(html).toContain('data-folded="true"');
  expect(html).toContain('data-settled=""');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('inert=""');
});

test('a settled signed-out session keeps the pitch open', () => {
  useAuth.mockReturnValue({ session: null, isAdmin: false, loading: false });
  const html = render();
  expect(html).toContain('data-settled=""');
  expect(html).not.toContain('data-folded');
  expect(html).not.toContain('aria-hidden');
});
