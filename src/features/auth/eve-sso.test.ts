import { describe, expect, it } from 'vitest';
import {
  buildAuthorizeUrl,
  claimsToCharacter,
  EVE_AUTHORIZE_URL,
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

describe('buildAuthorizeUrl', () => {
  it('encodes all required OAuth2 + PKCE parameters', () => {
    const url = buildAuthorizeUrl({
      clientId: 'abc123',
      callbackUrl: 'http://localhost:3000/api/auth/callback',
      state: 'state-token',
      codeChallenge: 'challenge-token',
    });
    expect(url.startsWith(`${EVE_AUTHORIZE_URL}?`)).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('response_type')).toBe('code');
    expect(params.get('client_id')).toBe('abc123');
    expect(params.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/callback',
    );
    expect(params.get('scope')).toBe('publicData');
    expect(params.get('state')).toBe('state-token');
    expect(params.get('code_challenge')).toBe('challenge-token');
    expect(params.get('code_challenge_method')).toBe('S256');
  });
});
