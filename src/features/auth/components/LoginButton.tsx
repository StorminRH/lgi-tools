'use client';

import { CharacterPortrait } from '@/components/character-portrait';
import { Chip } from '@/components/ui/chip';
import { authClient } from '../auth-client';
import { useAuth } from './AuthProvider';

export function LoginButton() {
  const { session, isAdmin: showAdminLink, loading } = useAuth();

  // Neutral placeholder until the session resolves — same footprint as the
  // logged-in cluster (a 32px portrait) so the right edge barely settles, and
  // no "Log in" → portrait flash for logged-in viewers.
  if (loading) {
    return (
      <div className="flex items-center gap-3" aria-hidden="true">
        <div className="w-8 h-8 rounded-[2px] border border-border-idle" />
      </div>
    );
  }

  if (!session) {
    return (
      <button
        type="button"
        onClick={() => {
          // Kicks off the EVE OAuth handshake (Better Auth redirects the browser
          // to EVE SSO, then back through the provider callback).
          void authClient.signIn.oauth2({ providerId: 'eve', callbackURL: '/' });
        }}
        className="inline-flex items-center hover:opacity-80 transition-opacity"
      >
        {/* CCP's official "Log in with EVE Online" SSO button (served locally from
            /public). Intrinsic 270×45, height-fit to the header; the <img> alt is
            the button's accessible name. */}
        <img
          src="/eve-sso-login-black-large.png"
          alt="Log in with EVE Online"
          width={270}
          height={45}
          className="h-8 w-auto"
        />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {showAdminLink ? (
        <a href="/admin" title="Open the admin dashboard">
          <Chip tone="purple">Admin</Chip>
        </a>
      ) : null}
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
        className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted hover:text-text px-2 py-1 transition-colors"
      >
        Log out
      </button>
    </div>
  );
}
