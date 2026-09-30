import { describe, expect, it } from 'vitest';
import { readOwnerHashClaim, withOwnerHashFromToken } from './owner-hash-claim';

const jwtWith = (payload: unknown): string =>
  `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

describe('readOwnerHashClaim', () => {
  it('reads the owner claim from an unverified EVE token payload', () => {
    expect(readOwnerHashClaim(jwtWith({ sub: 'CHARACTER:EVE:1', owner: 'abc123=' }))).toBe('abc123=');
  });

  it('returns null for a missing, empty, non-string or undecodable owner', () => {
    expect(readOwnerHashClaim(jwtWith({ sub: 'CHARACTER:EVE:1' }))).toBeNull();
    expect(readOwnerHashClaim(jwtWith({ owner: '' }))).toBeNull();
    expect(readOwnerHashClaim(jwtWith({ owner: 7 }))).toBeNull();
    expect(readOwnerHashClaim(jwtWith(42))).toBeNull();
    expect(readOwnerHashClaim('not-a-jwt')).toBeNull();
    expect(readOwnerHashClaim('a.%%%.c')).toBeNull();
    expect(readOwnerHashClaim(null)).toBeNull();
    expect(readOwnerHashClaim(undefined)).toBeNull();
  });
});

describe('withOwnerHashFromToken', () => {
  it('stamps ownerHash from a plaintext EVE access token', () => {
    const acct = { providerId: 'eve', accountId: '1', accessToken: jwtWith({ owner: 'own' }) };
    expect(withOwnerHashFromToken(acct)).toEqual({ ...acct, ownerHash: 'own' });
    expect(withOwnerHashFromToken({ ...acct, accessToken: 'garbage' })).toEqual({
      ...acct,
      accessToken: 'garbage',
      ownerHash: null,
    });
  });

  it('leaves non-EVE, tokenless and already-encrypted accounts alone', () => {
    const credential = { providerId: 'credential', accessToken: jwtWith({ owner: 'own' }) };
    expect(withOwnerHashFromToken(credential)).toBe(credential);
    const tokenless = { providerId: 'eve', accessToken: null };
    expect(withOwnerHashFromToken(tokenless)).toBe(tokenless);
    const encrypted = { providerId: 'eve', accessToken: 'v1:iv:tag:ciphertext' };
    expect(withOwnerHashFromToken(encrypted)).toBe(encrypted);
  });
});
