import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { EntityRow } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { auth } from '@/composition/auth';
import { getCorpStructuresPageData } from '@/composition/sync/corp-structures-sync';
import { CorpSharingSettings } from '@/features/owned-structures/components/CorpSharingSettings';
import type { CorpStructurePageView } from '@/features/owned-structures/types';
import { accountPageSettings } from '@/platform/page-settings/account';
import { resolvePageControls } from '@/platform/page-settings/controls';
import { SettingsSectionHead } from '../settings-section-head';
import {
  type CorporationMembershipView,
  deriveCorporationsView,
  settingsNeedsCorpSharing,
} from './corporations-view';

function MembershipRow({ membership }: { membership: CorporationMembershipView }) {
  return (
    <EntityRow
      colsClass="grid-cols-[minmax(0,1fr)_auto]"
      name={membership.corporationName}
      chips={
        <span className="flex items-center gap-[6px]">
          {membership.isStationManager ? (
            <Chip tone="green" className="normal-case">
              Station Manager
            </Chip>
          ) : (
            <Pill tone="neutral">Member</Pill>
          )}
          <Pill tone="neutral">{membership.sharingLabel}</Pill>
          {membership.structureCount !== null ? (
            <Pill tone="neutral">
              {membership.structureCount} structure{membership.structureCount === 1 ? '' : 's'}
            </Pill>
          ) : null}
        </span>
      }
    />
  );
}

function MembershipsCard({ rows }: { rows: CorpStructurePageView[] }) {
  const view = deriveCorporationsView(rows);
  return (
    <Card>
      <SectionHeader size="md" label="Memberships" hint={view.membershipHint} />
      {view.memberships.length === 0 ? (
        <EmptyState>
          No corporation memberships known yet — they appear once a linked character&apos;s
          affiliation has refreshed.
        </EmptyState>
      ) : (
        view.memberships.map((membership) => (
          <MembershipRow key={membership.corporationId} membership={membership} />
        ))
      )}
      <div className="border-t border-border-soft px-3.5 py-2.5 text-ui leading-relaxed text-muted">
        {view.managerCorps.length === 0 ? (
          <>
            Sharing controls appear here when one of your linked characters holds the Station
            Manager role in its corporation.{' '}
          </>
        ) : null}
        Shared structures, their rig fits, and facility taxes are managed on{' '}
        <Link href="/structures" className="text-tone-blue hover:underline">
          Structures
        </Link>
        .
      </div>
    </Card>
  );
}

async function CorporationsContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/?auth_error=login_required');
  }

  const models = resolvePageControls(accountPageSettings);
  const rows = settingsNeedsCorpSharing(models)
    ? await getCorpStructuresPageData(session.user.id)
    : [];
  const view = deriveCorporationsView(rows);

  return (
    <>
      {view.managerCorps.length > 0 ? <CorpSharingSettings corps={view.managerCorps} /> : null}
      <MembershipsCard rows={rows} />
    </>
  );
}

export default function CorporationsSettingsPage() {
  return (
    <>
      <SettingsSectionHead title="Corporations" />
      <Suspense
        fallback={<Skeleton label="Loading corporations" className="h-40 w-full rounded-card" />}
      >
        <CorporationsContent />
      </Suspense>
    </>
  );
}
