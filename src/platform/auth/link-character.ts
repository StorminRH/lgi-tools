import { authClient } from './auth-client';

export function startCharacterLink(callbackURL = '/characters'): void {
  void authClient.oauth2.link({
    providerId: 'eve',
    callbackURL,
    errorCallbackURL: callbackURL,
  });
}
