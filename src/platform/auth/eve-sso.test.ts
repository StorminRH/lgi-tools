import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import {
  EVE_REVOKE_URL,
  EVE_SCOPES,
  claimsToCharacter,
  exchangeCodeForToken,
  portraitUrl,
  refreshEveToken,
  revokeEveRefreshToken,
} from './eve-sso';

describe('EVE_SCOPES', () => {
  it('matches the verified least-privilege EVE scope names', () => {
    expect([...EVE_SCOPES]).toEqual([
      'publicData',
      'esi-skills.read_skills.v1',
      'esi-skills.read_skillqueue.v1',
      'esi-industry.read_character_jobs.v1',
      'esi-characters.read_corporation_roles.v1',
      'esi-industry.read_corporation_jobs.v1',
      'esi-characters.read_blueprints.v1',
      'esi-corporations.read_blueprints.v1',
      'esi-assets.read_assets.v1',
      'esi-assets.read_corporation_assets.v1',
      'esi-location.read_online.v1',
      'esi-location.read_location.v1',
      'esi-location.read_ship_type.v1',
      'esi-corporations.read_structures.v1',
      'esi-search.search_structures.v1',
    ]);
  });

  it('requests ZERO write scope (read-only by construction)', () => {
    for (const scope of EVE_SCOPES) {
      const readOnly =
        scope === 'publicData' ||
        /\.read_/.test(scope) ||
        scope === 'esi-search.search_structures.v1';
      expect(readOnly, `${scope} is not a read-only scope`).toBe(true);
    }
  });
});

describe('claimsToCharacter', () => {
  it('parses sub "CHARACTER:EVE:<id>" into characterId + portrait URL', () => {
    const out = claimsToCharacter({
      sub: 'CHARACTER:EVE:90000001',
      name: 'Test Pilot',
    });
    expect(out.characterId).toBe(90000001);
    expect(out.name).toBe('Test Pilot');
    expect(out.portraitUrl).toBe(
      'https://images.evetech.net/characters/90000001/portrait?size=128',
    );
  });

  it('throws on a malformed sub', () => {
    expect(() =>
      claimsToCharacter({ sub: 'CORPORATION:EVE:123', name: 'X' }),
    ).toThrow(/Unexpected sub format/);
    expect(() =>
      claimsToCharacter({ sub: 'CHARACTER:EVE:', name: 'X' }),
    ).toThrow(/Unexpected sub format/);
    expect(() =>
      claimsToCharacter({ sub: 'CHARACTER:EVE:abc', name: 'X' }),
    ).toThrow(/Unexpected sub format/);
  });

  it('throws when name is missing or empty', () => {
    expect(() =>
      claimsToCharacter({ sub: 'CHARACTER:EVE:1', name: '' }),
    ).toThrow(/missing `name`/);
    expect(() =>
      claimsToCharacter({
        sub: 'CHARACTER:EVE:1',
      } as Parameters<typeof claimsToCharacter>[0]),
    ).toThrow(/missing `name`/);
  });
});

describe('portraitUrl', () => {
  it('defaults to size=128', () => {
    expect(portraitUrl(42)).toBe(
      'https://images.evetech.net/characters/42/portrait?size=128',
    );
  });

  it('respects the size argument', () => {
    expect(portraitUrl(42, 64)).toBe(
      'https://images.evetech.net/characters/42/portrait?size=64',
    );
  });
});

describe('exchangeCodeForToken outbound headers', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('sends the outbound User-Agent to the EVE token endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: 'tok', token_type: 'Bearer' }),
        { status: 200 },
      ),
    );

    await exchangeCodeForToken({
      code: 'auth-code',
      codeVerifier: 'verifier',
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(new Headers(init?.headers).get('User-Agent')).toBe(
      OUTBOUND_USER_AGENT,
    );
  });

  it('attaches a timeout abort signal to the token request', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: 'tok', token_type: 'Bearer' }),
        { status: 200 },
      ),
    );

    await exchangeCodeForToken({
      code: 'auth-code',
      codeVerifier: 'verifier',
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects a token envelope missing access_token at the boundary', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ token_type: 'Bearer', expires_in: 1199 }), {
        status: 200,
      }),
    );

    await expect(
      exchangeCodeForToken({
        code: 'auth-code',
        codeVerifier: 'verifier',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      }),
    ).rejects.toThrow(/boundary validation/);
  });
});

describe('refreshEveToken', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const input = {
    refreshToken: 'a+b/c',
    clientId: 'client-id',
    clientSecret: 'client-secret',
  };

  it('returns ok with the rotated refresh token, and sends a refresh grant with the outbound UA + timeout', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'fresh-access',
          token_type: 'Bearer',
          expires_in: 1199,
          refresh_token: 'rotated-refresh',
        }),
        { status: 200 },
      ),
    );

    const result = await refreshEveToken(input);
    expect(result).toEqual({
      kind: 'ok',
      access_token: 'fresh-access',
      refresh_token: 'rotated-refresh',
      expires_in: 1199,
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(new Headers(init?.headers).get('User-Agent')).toBe(OUTBOUND_USER_AGENT);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.body).toContain('grant_type=refresh_token');
    expect(init?.body).toContain('refresh_token=a%2Bb%2Fc');
  });

  it('falls back to the submitted refresh token when the response omits one', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'fresh', expires_in: 1200 }), {
        status: 200,
      }),
    );

    const result = await refreshEveToken(input);
    expect(result).toEqual({
      kind: 'ok',
      access_token: 'fresh',
      refresh_token: 'a+b/c',
      expires_in: 1200,
    });
  });

  it('treats a 400 invalid_grant as a dead refresh token', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
    );
    expect(await refreshEveToken(input)).toEqual({
      kind: 'dead',
      failureClass: 'invalid_grant',
    });
  });

  it('treats a non-invalid_grant 400 as retryable (never destroys custody on our-side errors)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 }),
    );
    expect(await refreshEveToken(input)).toEqual({
      kind: 'retryable',
      failureClass: 'unexpected',
    });
  });

  it('treats a 400 with a missing/non-JSON body as retryable, not dead', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not json', { status: 400 }));
    expect(await refreshEveToken(input)).toEqual({
      kind: 'retryable',
      failureClass: 'unexpected',
    });
  });

  it('classifies a 5xx as a retryable provider failure', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('upstream', { status: 503 }));
    expect(await refreshEveToken(input)).toEqual({
      kind: 'retryable',
      failureClass: 'provider_5xx',
    });
  });

  it('classifies the shared outbound timeout separately from connection failures', async () => {
    fetchSpy.mockRejectedValueOnce(new DOMException('signal timed out', 'TimeoutError'));
    expect(await refreshEveToken(input)).toEqual({
      kind: 'retryable',
      failureClass: 'timeout',
    });
  });

  it('classifies another thrown fetch error as a retryable connection failure', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await refreshEveToken(input)).toEqual({
      kind: 'retryable',
      failureClass: 'connection',
    });
  });

  it('classifies a non-5xx HTTP failure such as 429 as unexpected', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    expect(await refreshEveToken(input)).toEqual({
      kind: 'retryable',
      failureClass: 'unexpected',
    });
  });

  it('classifies malformed success JSON as unexpected instead of throwing', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not json', { status: 200 }));
    expect(await refreshEveToken(input)).toEqual({
      kind: 'retryable',
      failureClass: 'unexpected',
    });
  });
});

describe('revokeEveRefreshToken', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const input = {
    refreshToken: 'a+b/c',
    clientId: 'client-id',
    clientSecret: 'client-secret',
  };

  it('POSTs the RFC 7009 revoke params to the revoke endpoint with Basic auth + the outbound UA', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await revokeEveRefreshToken(input);
    expect(result).toEqual({ ok: true });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(EVE_REVOKE_URL);
    expect(init?.body).toContain('token=a%2Bb%2Fc');
    expect(init?.body).toContain('token_type_hint=refresh_token');
    expect(init?.body).not.toContain('grant_type');
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe(
      `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
    );
    expect(headers.get('User-Agent')).toBe(OUTBOUND_USER_AGENT);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('reports ok:false on a non-2xx without throwing (best-effort; 200-on-invalid is CCP-specific)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('nope', { status: 400 }));
    expect(await revokeEveRefreshToken(input)).toEqual({ ok: false });
  });

  it('swallows a network/timeout error and reports ok:false (never aborts a purge)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('aborted'));
    expect(await revokeEveRefreshToken(input)).toEqual({ ok: false });
  });
});
