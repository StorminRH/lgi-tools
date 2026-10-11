import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
import { authClient } from './auth-client';

/**
 * Start EVE SSO sign-in. On success the auth client navigates to EVE itself;
 * on a failed or rejected request the user stays on the page.
 */
export function startEveSignIn(callbackURL = '/'): void {
  void authClient.signIn.oauth2({ providerId: EVE_PROVIDER_ID, callbackURL }).catch(() => {});
}

export function startCharacterLink(callbackURL = '/settings/characters'): void {
  void authClient.oauth2.link({
    providerId: EVE_PROVIDER_ID,
    callbackURL,
    errorCallbackURL: callbackURL,
  });
}
