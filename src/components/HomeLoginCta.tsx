'use client';

import { Button } from '@/components/ui/button';
import { authClient } from '@/features/auth/auth-client';

// The anonymous hero's primary call to action. Kicks off the same EVE SSO
// handshake as the header's login button (Better Auth redirects the browser to
// EVE, then back through the provider callback).
export function HomeLoginCta() {
  return (
    <Button
      variant="primary"
      onClick={() => {
        void authClient.signIn.oauth2({ providerId: 'eve', callbackURL: '/' });
      }}
      className="self-start"
    >
      Log in with EVE
    </Button>
  );
}
