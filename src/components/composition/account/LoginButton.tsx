'use client';

import { CharacterPortrait } from '@/components/character-portrait';
import { EveImage } from '@/components/eve-image';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { authClient } from '@/platform/auth/auth-client';
import { reloadDocumentHome } from '@/platform/auth/reload-document-home';
import { AccountMenu } from './AccountMenu';
import { useAuth } from '@/platform/auth/components/AuthProvider';

type SignedInSession = NonNullable<ReturnType<typeof useAuth>['session']>;

function AdminChip({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <a href="/admin" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
      Admin
    </a>
  );
}

export function EveSignInButton({ callbackURL = '/' }: { callbackURL?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        void authClient.signIn.oauth2({ providerId: 'eve', callbackURL });
      }}
      className="inline-flex items-center hover:opacity-80 transition-opacity"
    >
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
        <Tooltip content={session.name}>
          <a
            href="/characters"
            aria-label={`${session.name} — manage your characters`}
            className="flex items-center transition-opacity hover:opacity-80"
          >
            <CharacterPortrait
              characterId={session.characterId}
              name={session.name}
              size={32}
              src={session.portraitUrl}
              preload
            />
          </a>
        </Tooltip>
        <Button
          variant="bare"
          type="button"
          onClick={() => {
            void authClient.signOut().finally(() => {
              reloadDocumentHome();
            });
          }}
          className="text-label uppercase tracking-wide text-muted hover:text-text px-2 py-1 transition-colors"
        >
          Log out
        </Button>
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

export function LoginButton({ variant = 'menu' }: { variant?: 'menu' | 'flat' }) {
  const { session, isAdmin: showAdminLink, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center gap-3">
        <Skeleton label="Loading account" className="size-8 rounded-full" />
      </div>
    );
  }

  if (!session) {
    return <EveSignInButton />;
  }

  return <SignedInCluster variant={variant} session={session} showAdminLink={showAdminLink} />;
}
