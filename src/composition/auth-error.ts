import { AUTH_ERROR_CODES, type AuthErrorCode } from '@/platform/auth/api-contract';

/** The home page link a page guard redirects to, carrying the notice code. */
export function authErrorHref(code: AuthErrorCode): string {
  return `/?auth_error=${code}`;
}

/** True only for a known code, so a query value such as `constructor` never reaches a copy table. */
export function isAuthErrorCode(value: unknown): value is AuthErrorCode {
  return typeof value === 'string' && (AUTH_ERROR_CODES as readonly string[]).includes(value);
}
