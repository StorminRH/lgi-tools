// PKCE (RFC 7636) + state helpers for the EVE SSO authorize redirect.
// Pure functions — no DB, no cookies, no Next.js APIs. Uses Node's built-in
// Web Crypto (Node 20+) so there are no dependencies to add.

import { randomBytes } from 'node:crypto';

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

// 32 random bytes → 43-char base64url string (the RFC 7636 verifier shape).
export function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

// S256: code_challenge = base64url(sha256(verifier)).
export async function codeChallengeFromVerifier(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

// Opaque random token used to bind the authorize redirect to its callback.
export function generateState(): string {
  return base64UrlEncode(randomBytes(16));
}
