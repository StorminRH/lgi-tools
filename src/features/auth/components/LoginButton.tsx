'use client';

import { Chip } from '@/components/ui/chip';
import { authClient } from '../auth-client';
import { useAuth } from './AuthProvider';

export function LoginButton() {
  const { session, isAdmin: showAdminLink, loading } = useAuth();

  // Neutral placeholder until the session resolves — same footprint as the
  // logged-in cluster (28px portrait + a short name run) so the right edge
  // barely settles, and no "Log in" → username flash for logged-in viewers.
  if (loading) {
    return (
      <div className="flex items-center gap-3" aria-hidden="true">
        <div className="w-7 h-7 rounded-[2px] border border-border-idle" />
        <div className="w-16 h-3 rounded-[2px] bg-border-idle" />
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
        className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-1.5 border border-border-idle hover:border-border-active text-isk transition-colors"
      >
        Log in with EVE
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
        title="Manage your characters"
        className="flex items-center gap-3 hover:opacity-80 transition-opacity"
      >
        <img
          src={session.portraitUrl}
          alt={session.name}
          width={28}
          height={28}
          loading="eager"
          decoding="async"
          className="rounded-[2px] border border-border-idle"
        />
        <span className="font-mono text-[11px] text-text">{session.name}</span>
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
