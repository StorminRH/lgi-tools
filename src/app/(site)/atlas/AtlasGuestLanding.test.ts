import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { AtlasGuestLanding } from './AtlasGuestLanding';

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/components/composition/account/LoginButton', () => ({
  EveSignInButton: ({ callbackURL }: { callbackURL?: string }) =>
    createElement('button', { type: 'button', 'data-eve-sign-in': callbackURL ?? '/' }, 'Log in with EVE Online'),
}));

it('gates guests behind EVE sign-in that returns to the shared map, and lists the tracking setup', () => {
  mocks.searchParams = new URLSearchParams();
  const landing = renderToStaticMarkup(createElement(AtlasGuestLanding));
  expect(landing).toContain('data-atlas-guest-landing');
  expect(landing).toContain('data-page-shell-mode="workspace"');
  expect(landing).toContain('lgi://</span>atlas');
  expect(landing).toContain('>Atlas</h1>');
  expect(landing).toContain('Sign in required');
  expect(landing).toContain('data-eve-sign-in="/atlas"');
  expect(landing).toContain('Set up tracking');
  expect(landing.match(/<li\b/g)).toHaveLength(3);
  expect(landing).toContain('Add character');
  expect(landing).toContain('Tracking');
  expect(landing).not.toContain('data-map-catalogue');
  expect(landing).not.toContain('data-map-canvas');

  mocks.searchParams = new URLSearchParams('map=map%2Fone&error=access_denied');
  const sharedMap = renderToStaticMarkup(createElement(AtlasGuestLanding));
  expect(sharedMap).toContain('data-eve-sign-in="/atlas?map=map%2Fone"');
});
