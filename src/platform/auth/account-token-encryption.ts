import { EVE_PROVIDER_ID } from './eve-sso';
import { TOKEN_CRYPTO_VERSION } from './token-crypto';

const CIPHERTEXT_PREFIX = `${TOKEN_CRYPTO_VERSION}:`;

export type PreparedAccountTokenWrite<T> = T & {
  refreshTokenInvalidGrantCount?: number;
  refreshTokenInvalidGrantFirstAt?: Date | null;
};

export function encryptAccountTokens<
  T extends {
    providerId?: string;
    accessToken?: string | null;
    refreshToken?: string | null;
  },
>(data: T, encrypt: (plaintext: string) => string): PreparedAccountTokenWrite<T> {
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
