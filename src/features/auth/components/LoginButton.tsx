'use client';

import { CharacterPortrait } from '@/components/character-portrait';
import { EveImage } from '@/components/eve-image';
import { Chip } from '@/components/ui/chip';
import { authClient } from '../auth-client';
import { AccountMenu } from './AccountMenu';
import { useAuth } from './AuthProvider';

type SignedInSession = NonNullable<ReturnType<typeof useAuth>['session']>;

// The purple "Admin" chip linking to the dashboard, shown to admins in both
// signed-in cluster shapes.
function AdminChip({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <a href="/admin" title="Open the admin dashboard">
      <Chip tone="purple">Admin</Chip>
    </a>
  );
}

// CCP's official "Log in with EVE Online" SSO button. Clicking kicks off the EVE
// OAuth handshake (Better Auth redirects to EVE SSO, then back through the
// provider callback).
function SignedOutButton() {
  return (
    <button
      type="button"
      onClick={() => {
        void authClient.signIn.oauth2({ providerId: 'eve', callbackURL: '/' });
      }}
      className="inline-flex items-center hover:opacity-80 transition-opacity"
    >
      {/* CCP's official "Log in with EVE Online" SSO button (served locally from
          /public). Intrinsic 270×45, height-fit to the header; its alt text is
          the button's accessible name. */}
      <EveImage
        source="static"
        src="/eve-sso-login-black-large.png"
        alt="Log in with EVE Online"
        width={270}
        height={45}
        className="h-8 w-auto"
      />
    </button>
  );
}

// The signed-in cluster. `flat` renders the legacy portrait-link + Log out button
// (the hamburger footer's shape, where a menu must never nest inside the NavMenu
// popup); `menu` renders the portrait as the account-menu trigger.
function SignedInCluster({
  variant,
  session,
  showAdminLink,
}: {
  variant: 'menu' | 'flat';
  session: SignedInSession;
  showAdminLink: boolean;
}) {
  if (variant === 'flat') {
    return (
      <div className="flex items-center gap-3">
        <AdminChip show={showAdminLink} />
        <a
          href="/characters"
          title={session.name}
          aria-label={`${session.name} — manage your characters`}
          className="flex items-center hover:opacity-80 transition-opacity"
        >
          <CharacterPortrait
            characterId={session.characterId}
            name={session.name}
            size={32}
            src={session.portraitUrl}
            preload
          />
        </a>
        <button
          type="button"
          onClick={() => {
            // Clear the session, then hard-navigate home so cached server-component
            // output that referenced the now-gone session is dropped.
            void authClient.signOut().finally(() => {
              window.location.href = '/';
            });
          }}
          className="font-mono text-label uppercase tracking-wide text-muted hover:text-text px-2 py-1 transition-colors"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <AdminChip show={showAdminLink} />
      <AccountMenu session={session} />
    </div>
  );
}

/**
 * `variant` picks the signed-in cluster's shape: 'menu' (default) renders the
 * portrait as the account-menu trigger (the desktop header); 'flat' renders the
 * legacy portrait-link + Log out button — the hamburger footer's shape, where a
 * menu must never nest inside the NavMenu popup. Loading + signed-out render
 * identically in both.
 */
export function LoginButton({ variant = 'menu' }: { variant?: 'menu' | 'flat' }) {
  const { session, isAdmin: showAdminLink, loading } = useAuth();

  // Neutral placeholder until the session resolves — same footprint as the
  // logged-in cluster (a 32px portrait) so the right edge barely settles, and
  // no "Log in" → portrait flash for logged-in viewers.
  if (loading) {
    return (
      <div className="flex items-center gap-3" aria-hidden="true">
        <div className="w-8 h-8 rounded-full border border-border-idle" />
      </div>
    );
  }

  if (!session) {
    return <SignedOutButton />;
  }

  return <SignedInCluster variant={variant} session={session} showAdminLink={showAdminLink} />;
}
