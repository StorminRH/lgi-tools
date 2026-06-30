import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import {
  EVE_SCOPES,
  claimsToCharacter,
  exchangeCodeForToken,
  portraitUrl,
  refreshEveToken,
} from './eve-sso';

describe('EVE_SCOPES', () => {
  // The regression guard for the requested-scope set — and, by extension, for
  // what every sign-in/relink re-consents to and persists (Better Auth forwards
  // these to the authorize request and the token exchange; see the getToken site
  // in auth.ts). EVE rejects an unknown scope with `invalid_scope`, which breaks
  // ALL sign-in (a wrong name shipped in 3.4.1a and did exactly that).
  //
  // 3.7.1.1 pruned this to STRICT LEAST-PRIVILEGE; 3.7.3.1 (the first corp
  // feature) added the two corp reads, taking it to six; 3.7.5.1 added the two
  // blueprint reads (owned-blueprints dataset), taking it to eight; 3.7.7.1
  // added the two asset reads (owned-assets dataset), taking it to ten; MIGRATE.A
  // re-admitted the online-status read (esi-location.read_online.v1, pruned in
  // 3.7.1.1) for the live online-status canary, taking it to eleven; 3.7.9 added
  // the corp owned-structures read (esi-corporations.read_structures.v1) for the
  // planner's build-location catalogue, taking it to twelve. Naming
  // trap still worth pinning: the skill-queue read lives under `esi-skills`, NOT
  // `esi-skillqueue`. (`read_attributes` does not exist; /attributes is gated by
  // `read_skills`.) The corp roles read lives under `esi-characters`, NOT
  // `esi-corporations` — but the corp BLUEPRINTS and corp STRUCTURES reads live
  // under `esi-corporations`, while BOTH asset reads live under `esi-assets` (the
  // corp one is `read_corporation_assets`). Adding a scope is a deliberate, batched
  // decision — verify the exact live name before touching this list.
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
      'esi-corporations.read_structures.v1',
    ]);
  });

  it('requests ZERO write scope (read-only by construction)', () => {
    // Least-privilege: every scope is `publicData` or a `.read_` scope — never a
    // `manage_`/`write_` capability. Catches a write scope slipping in (the kind
    // that grants mutate-the-character access we never need).
    for (const scope of EVE_SCOPES) {
      const readOnly = scope === 'publicData' || /\.read_/.test(scope);
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
    // 200 OK but no access_token — the boundary schema rejects it, throwing
    // the same way an HTTP error does; the callback maps that to the
    // token_exchange_failed auth-error redirect.
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
    // grant + url-encoded refresh token both ride the body.
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
    expect(await refreshEveToken(input)).toEqual({ kind: 'dead' });
  });

  it('treats a non-invalid_grant 400 as retryable (never destroys custody on our-side errors)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 }),
    );
    expect(await refreshEveToken(input)).toEqual({ kind: 'retryable' });
  });

  it('treats a 400 with a missing/non-JSON body as retryable, not dead', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not json', { status: 400 }));
    expect(await refreshEveToken(input)).toEqual({ kind: 'retryable' });
  });

  it('treats a 5xx as retryable', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('upstream', { status: 503 }));
    expect(await refreshEveToken(input)).toEqual({ kind: 'retryable' });
  });

  it('treats a network/timeout error as retryable', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('aborted'));
    expect(await refreshEveToken(input)).toEqual({ kind: 'retryable' });
  });
});
