import { EVE_PROVIDER_ID } from './eve-sso-constants';
import { TOKEN_CRYPTO_VERSION } from './token-crypto';

/**
 * Reads `owner` from an EVE access-token payload without verifying it. Sound
 * only for a token this process already verified (the one getUserInfo just
 * checked) or one it stored after verifying (a decrypted account row).
 */
export function readOwnerHashClaim(accessToken: string | null | undefined): string | null {
  const payload = accessToken?.split('.')[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const owner = (claims as { owner?: unknown } | null)?.owner;
    return typeof owner === 'string' && owner.length > 0 ? owner : null;
  } catch {
    return null;
  }
}

/** For account.create.before: stamps the owner hash while the access token is still plaintext. */
export function withOwnerHashFromToken<
  T extends { providerId?: string; accessToken?: string | null },
>(acct: T): T & { ownerHash?: string | null } {
  if (acct.providerId !== EVE_PROVIDER_ID) return acct;
  const token = acct.accessToken;
  if (!token || token.startsWith(`${TOKEN_CRYPTO_VERSION}:`)) return acct;
  return { ...acct, ownerHash: readOwnerHashClaim(token) };
}
