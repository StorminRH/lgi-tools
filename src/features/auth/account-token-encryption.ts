import { EVE_PROVIDER_ID } from './eve-sso';
import { TOKEN_CRYPTO_VERSION } from './token-crypto';

// A token already at rest carries the crypto-version prefix; the guard below skips
// such a value so a re-login update never double-encrypts (idempotent).
const CIPHERTEXT_PREFIX = `${TOKEN_CRYPTO_VERSION}:`;

type PreparedAccountTokenWrite<T> = T & {
  refreshTokenInvalidGrantCount?: number;
  refreshTokenInvalidGrantFirstAt?: Date | null;
};

// Encrypt the EVE access/refresh tokens on an account write before it reaches
// the DB. A non-empty replacement refresh token also proves the OAuth grant is
// healthy, so the same write clears any prior invalid-grant strike. The create
// hook receives the full account; the update hook (re-login) receives only the
// changed fields — so unrelated account updates leave the strike untouched and
// tokens already at rest remain idempotent. `encrypt` is injected (the real
// EVE-keyed encryptToken at the call site) so the guard matrix is unit-testable
// without the dedicated key. The key lives in token-crypto.ts.
export function encryptAccountTokens<
  T extends {
    providerId?: string;
    accessToken?: string | null;
    refreshToken?: string | null;
  },
>(data: T, encrypt: (plaintext: string) => string): PreparedAccountTokenWrite<T> {
  // EVE is the ONLY provider today, so every account token reaching this hook is
  // an EVE token encrypted under EVE_TOKEN_ENCRYPTION_KEY. We skip only a write
  // that positively declares a non-EVE provider. The update path (re-login) often
  // omits providerId — for an EVE-only app that correctly still encrypts, which is
  // required (a re-login token refresh must not land plaintext). FORWARD-COMPAT: if
  // a second OAuth provider is ever wired in, revisit this — its tokens would
  // otherwise be encrypted under the EVE key and become unreadable. The fix then is
  // a per-provider key (or a positive-EVE-only guard that still covers the
  // providerId-absent EVE update path), not flipping this guard naively.
  if (data.providerId != null && data.providerId !== EVE_PROVIDER_ID) return data;
  const out: PreparedAccountTokenWrite<T> = { ...data };
  if (
    typeof out.accessToken === 'string' &&
    out.accessToken.length > 0 &&
    !out.accessToken.startsWith(CIPHERTEXT_PREFIX)
  ) {
    out.accessToken = encrypt(out.accessToken);
  }
  if (
    typeof out.refreshToken === 'string' &&
    out.refreshToken.length > 0 &&
    !out.refreshToken.startsWith(CIPHERTEXT_PREFIX)
  ) {
    out.refreshToken = encrypt(out.refreshToken);
  }
  if (typeof data.refreshToken === 'string' && data.refreshToken.length > 0) {
    out.refreshTokenInvalidGrantCount = 0;
    out.refreshTokenInvalidGrantFirstAt = null;
  }
  return out;
}
