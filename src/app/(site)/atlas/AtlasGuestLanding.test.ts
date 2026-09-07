import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { AtlasGuestLanding } from './AtlasGuestLanding';

vi.mock('@/components/composition/account/LoginButton', () => ({
  EveSignInButton: ({ callbackURL }: { callbackURL?: string }) =>
    createElement('button', { type: 'button', 'data-eve-sign-in': callbackURL ?? '/' }, 'Log in with EVE Online'),
}));

it('gates guests behind EVE sign-in that returns to the shared map, and lists the tracking setup', () => {
  const landing = renderToStaticMarkup(
    createElement(AtlasGuestLanding, { returnHref: '/atlas' }),
  );
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

  const sharedMap = renderToStaticMarkup(
    createElement(AtlasGuestLanding, { returnHref: '/atlas?map=map%2Fone' }),
  );
  expect(sharedMap).toContain('data-eve-sign-in="/atlas?map=map%2Fone"');
});
