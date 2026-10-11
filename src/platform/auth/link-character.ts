import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
import { authClient } from './auth-client';

/**
 * On success the auth client navigates to EVE itself. A failed or rejected
 * request (a network error rejects) leaves the user on the page, so both
 * starts swallow it rather than leak an unhandled rejection.
 */
const stayOnPage = (): void => {};

/**
 * Start EVE SSO sign-in. Any failed sign-in comes back to the home page, in
 * development as in production; the page explains a refused link
 * (`?error=account_not_linked`).
 */
export function startEveSignIn(callbackURL = '/'): void {
  void authClient.signIn.oauth2({
    providerId: EVE_PROVIDER_ID,
    callbackURL,
    errorCallbackURL: '/',
  }).catch(stayOnPage);
}

/** Link another EVE character, returning to `callbackURL` whether or not it succeeds. */
export function startCharacterLink(callbackURL = '/settings/characters'): void {
  void authClient.oauth2.link({
    providerId: EVE_PROVIDER_ID,
    callbackURL,
    errorCallbackURL: callbackURL,
  }).catch(stayOnPage);
}
