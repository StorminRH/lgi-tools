'use client';

import { authClient } from '../auth-client';

// Kicks off the EVE OAuth handshake to attach ANOTHER character to the current
// user (Better Auth's /oauth2/link). Mirrors LoginButton's sign-in call — the
// client follows the returned authorize URL automatically. The same flow doubles
// as "Reconnect": re-linking an already-owned character refreshes its stored
// tokens and granted scopes via the callback's update path.
//
// No `scopes` is passed here on purpose — the link request falls back to the
// static provider config (EVE_SCOPES), so a relink always re-consents to the
// CURRENT requested superset and the callback rewrites `account.scope` to match.
// Narrowing/expanding what a relink grants is therefore a one-line change in
// EVE_SCOPES (eve-sso.ts), guarded by its pin test — nothing to change here.
export function LinkCharacterButton({
  label = 'Link another character',
  emphasis = 'primary',
  callbackURL = '/characters',
}: {
  label?: string;
  emphasis?: 'primary' | 'reconnect';
  // Where the OAuth round-trip returns to (success + error). Defaults to the
  // Characters page; the home roster points it back at `/`.
  callbackURL?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void authClient.oauth2.link({
          providerId: 'eve',
          callbackURL,
          errorCallbackURL: callbackURL,
        });
      }}
      className={
        emphasis === 'reconnect'
          ? 'font-mono text-[10px] uppercase tracking-[0.12em] px-2 py-1 border border-border-idle hover:border-border-active text-tone-orange transition-colors whitespace-nowrap'
          : 'inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-1.5 border border-border-idle hover:border-border-active text-isk transition-colors'
      }
    >
      {label}
    </button>
  );
}
