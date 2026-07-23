import { authClient } from './auth-client';

/**
 * Starts the EVE OAuth character-link flow and preserves the caller's return path.
 */
export function startCharacterLink(callbackURL = '/characters'): void {
  void authClient.oauth2.link({
    providerId: 'eve',
    callbackURL,
    errorCallbackURL: callbackURL,
  });
}
