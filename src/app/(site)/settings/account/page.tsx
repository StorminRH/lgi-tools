import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { AccountDangerZone } from '@/components/composition/account/AccountDangerZone';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { auth } from '@/composition/auth';
import { formatIsoDay } from '@/lib/format/time';
import { getActiveSessionCount } from '@/platform/auth/admin-users';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import { SettingsSectionHead } from '../settings-section-head';

function OverviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border-soft px-3.5 py-2.5 text-ui first:border-t-0">
      <span className="text-muted">{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-2 text-text">{children}</span>
    </div>
  );
}

async function AccountContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/?auth_error=login_required');
  }

  const [characters, sessionCount] = await Promise.all([
    listLinkedCharacters(session.user.id),
    getActiveSessionCount(session.user.id),
  ]);

  return (
    <>
      <Card>
        <SectionHeader size="md" label="Overview" />
        <OverviewRow label="Signed in as">
          <CharacterPortrait
            characterId={session.characterId ?? undefined}
            name={session.name}
            size={28}
            src={session.portraitUrl}
          />
          <span className="truncate text-name">{session.name}</span>
          {session.isAdmin ? <Chip tone="purple">Admin</Chip> : null}
        </OverviewRow>
        <OverviewRow label="Linked characters">
          <span className="font-data">{characters.length}</span>
          <Link href="/settings/characters" className="text-tone-blue hover:underline">
            Manage →
          </Link>
        </OverviewRow>
        <OverviewRow label="Active sessions">
          <span className="font-data">{sessionCount}</span>
        </OverviewRow>
        <OverviewRow label="Account created">
          <span className="font-data">{formatIsoDay(session.user.createdAt)}</span>
        </OverviewRow>
      </Card>

      <AccountDangerZone
        characters={characters.map((c) => ({ characterId: c.characterId, name: c.name }))}
      />
    </>
  );
}

export default function AccountSettingsPage() {
  return (
    <>
      <SettingsSectionHead title="Account" />
      <Suspense fallback={<Skeleton label="Loading account" className="h-40 w-full rounded-card" />}>
        <AccountContent />
      </Suspense>
    </>
  );
}
