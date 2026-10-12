import { AUTH_ERROR_CODES, type AuthErrorCode, type BetterAuthLinkError } from '@/platform/auth/api-contract';

/** Copy for the refusals Better Auth sends an "Add character" link back with, on whichever page the link started from. */
export const LINK_ERROR_MESSAGES = {
  account_already_linked_to_different_user: 'That character is already linked to another account.',
  "email_doesn't_match": 'Linking failed. Please try again.',
} satisfies Record<BetterAuthLinkError, string>;

/** The home page link a page guard redirects to, carrying the notice code. */
export function authErrorHref(code: AuthErrorCode): string {
  return `/?auth_error=${code}`;
}

/** True only for a known code, so a query value such as `constructor` never reaches a copy table. */
export function isAuthErrorCode(value: unknown): value is AuthErrorCode {
  return typeof value === 'string' && (AUTH_ERROR_CODES as readonly string[]).includes(value);
}
