import { describe, expect, it } from 'vitest';
import { decorateAbsorbRedirect } from './absorb-redirect';

const REQUEST_URL = 'https://lgi.tools/api/auth/oauth2/callback/eve';

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

describe('decorateAbsorbRedirect', () => {
  it('returns the response untouched when no absorb happened', () => {
    const response = redirect('/characters');
    expect(decorateAbsorbRedirect(response, REQUEST_URL, null)).toBe(response);
  });

  it('returns non-redirect responses untouched even after an absorb', () => {
    for (const status of [200, 400, 500]) {
      const response = new Response('body', { status });
      expect(decorateAbsorbRedirect(response, REQUEST_URL, 90000001)).toBe(response);
    }
  });

  it('returns a redirect without a Location untouched', () => {
    const response = new Response(null, { status: 302 });
    expect(decorateAbsorbRedirect(response, REQUEST_URL, 90000001)).toBe(response);
  });

  it('never decorates an error redirect — a failed callback must not claim a move', () => {
    const response = redirect('/characters?error=oauth_failure');
    expect(decorateAbsorbRedirect(response, REQUEST_URL, 90000001)).toBe(response);
  });

  it('appends the absorbed id to a clean redirect', () => {
    const decorated = decorateAbsorbRedirect(redirect('/characters'), REQUEST_URL, 90000001);
    const location = decorated.headers.get('location');
    expect(location).toBe('https://lgi.tools/characters?absorbed=90000001');
    expect(decorated.status).toBe(302);
  });

  it('resolves a relative Location against the request URL and keeps existing params', () => {
    const decorated = decorateAbsorbRedirect(
      redirect('/characters?tab=roster', 303),
      REQUEST_URL,
      42,
    );
    expect(decorated.headers.get('location')).toBe(
      'https://lgi.tools/characters?tab=roster&absorbed=42',
    );
    expect(decorated.status).toBe(303);
  });

  it('preserves an absolute Location host', () => {
    const decorated = decorateAbsorbRedirect(
      redirect('https://lgi.tools/characters'),
      REQUEST_URL,
      7,
    );
    expect(decorated.headers.get('location')).toBe('https://lgi.tools/characters?absorbed=7');
  });
});
