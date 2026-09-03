import { expect, test } from 'vitest';
import { decorateAbsorbRedirect } from './absorb-redirect';

const REQUEST_URL = 'https://lgi.tools/api/auth/oauth2/callback/eve';

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

test('leaves non-absorb, non-redirect, missing-Location, and error redirects untouched', () => {
  const clean = redirect('/characters');
  expect(decorateAbsorbRedirect(clean, REQUEST_URL, null)).toBe(clean);

  for (const status of [200, 400, 500]) {
    const response = new Response('body', { status });
    expect(decorateAbsorbRedirect(response, REQUEST_URL, 90000001)).toBe(response);
  }

  const noLocation = new Response(null, { status: 302 });
  expect(decorateAbsorbRedirect(noLocation, REQUEST_URL, 90000001)).toBe(noLocation);

  const failed = redirect('/characters?error=oauth_failure');
  expect(decorateAbsorbRedirect(failed, REQUEST_URL, 90000001)).toBe(failed);
});

test('appends the absorbed id to clean relative and absolute redirects and preserves status', () => {
  const decorated = decorateAbsorbRedirect(redirect('/characters'), REQUEST_URL, 90000001);
  expect(decorated.headers.get('location')).toBe('https://lgi.tools/characters?absorbed=90000001');
  expect(decorated.status).toBe(302);

  const withParams = decorateAbsorbRedirect(redirect('/characters?tab=roster', 303), REQUEST_URL, 42);
  expect(withParams.headers.get('location')).toBe(
    'https://lgi.tools/characters?tab=roster&absorbed=42',
  );
  expect(withParams.status).toBe(303);

  const absolute = decorateAbsorbRedirect(redirect('https://lgi.tools/characters'), REQUEST_URL, 7);
  expect(absolute.headers.get('location')).toBe('https://lgi.tools/characters?absorbed=7');
});
