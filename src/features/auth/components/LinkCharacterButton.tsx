'use client';

import { authClient } from '../auth-client';

// Kicks off the EVE OAuth handshake to attach ANOTHER character to the current
// user (Better Auth's /oauth2/link). Mirrors LoginButton's sign-in call — the
// client follows the returned authorize URL automatically. The same flow doubles
// as "Reconnect": re-linking an already-owned character refreshes its stored
// tokens and granted scopes via the callback's update path.
export function LinkCharacterButton({
  label = 'Link another character',
  emphasis = 'primary',
}: {
  label?: string;
  emphasis?: 'primary' | 'reconnect';
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void authClient.oauth2.link({
          providerId: 'eve',
          callbackURL: '/characters',
          errorCallbackURL: '/characters',
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
