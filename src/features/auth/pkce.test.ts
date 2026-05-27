import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  codeChallengeFromVerifier,
  generateCodeVerifier,
  generateState,
} from './pkce';

const BASE64URL_CHARSET = /^[A-Za-z0-9_-]+$/;

describe('generateCodeVerifier', () => {
  it('produces a 43-char base64url string (32 random bytes)', () => {
    const v = generateCodeVerifier();
    expect(v).toHaveLength(43);
    expect(v).toMatch(BASE64URL_CHARSET);
  });

  it('returns different values across calls', () => {
    const samples = new Set([
      generateCodeVerifier(),
      generateCodeVerifier(),
      generateCodeVerifier(),
    ]);
    expect(samples.size).toBe(3);
  });
});

describe('codeChallengeFromVerifier', () => {
  it('matches base64url(sha256(verifier)) — RFC 7636 S256', async () => {
    const verifier = 'test-verifier-for-rfc-7636-s256-check';
    const expected = createHash('sha256').update(verifier).digest('base64url');
    const got = await codeChallengeFromVerifier(verifier);
    expect(got).toBe(expected);
  });

  it('produces a base64url-safe string', async () => {
    const challenge = await codeChallengeFromVerifier(generateCodeVerifier());
    expect(challenge).toMatch(BASE64URL_CHARSET);
    expect(challenge).toHaveLength(43);
  });
});

describe('generateState', () => {
  it('produces a base64url string', () => {
    const s = generateState();
    expect(s).toMatch(BASE64URL_CHARSET);
    expect(s.length).toBeGreaterThanOrEqual(20);
  });

  it('returns different values across calls', () => {
    const samples = new Set([generateState(), generateState(), generateState()]);
    expect(samples.size).toBe(3);
  });
});
