'use client';

import { authClient } from '@/features/auth/auth-client';

// The anonymous hero's primary call to action. Kicks off the same EVE SSO
// handshake as the header's login button (Better Auth redirects the browser to
// EVE, then back through the provider callback).
export function HomeLoginCta() {
  return (
    <button
      type="button"
      onClick={() => {
        void authClient.signIn.oauth2({ providerId: 'eve', callbackURL: '/' });
      }}
      className="inline-flex items-center gap-2 self-start font-mono text-ui tracking-[0.02em] px-4 py-2 rounded-[3px] border border-isk-dim bg-pill-green-bg text-isk hover:border-isk hover:text-name transition-colors"
    >
      Log in with EVE
    </button>
  );
}
