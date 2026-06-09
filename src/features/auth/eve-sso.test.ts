import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import {
  claimsToCharacter,
  exchangeCodeForToken,
  portraitUrl,
} from './eve-sso';

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
