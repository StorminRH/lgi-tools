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
import { getFullSession } from '@/composition/session';
import { getCorpStructuresPageData } from '@/composition/sync/corp-structures-sync';
import { CorpSharingSettings } from '@/features/owned-structures/components/CorpSharingSettings';
import { accountPageSettings } from '@/platform/page-settings/account';
import { resolvePageControls } from '@/platform/page-settings/controls';
import { SectionHead } from '@/components/ui/section-head';
import {
  type CorporationMembershipView,
  type CorporationsView,
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
          {membership.roleLabel === 'Member' ? (
            <Pill tone="neutral">Member</Pill>
          ) : (
            <Chip tone="green" className="normal-case">
              {membership.roleLabel}
            </Chip>
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

function MembershipsCard({ view }: { view: CorporationsView }) {
  return (
    <Card className="reveal reveal-1">
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
        {view.directorCorps.length === 0 ? (
          <>Only a Director can turn corporation data sharing on or off. </>
        ) : null}
        Station Managers and Directors set corporation structure rig fits and facility taxes on{' '}
        <Link href="/structures" className="text-tone-blue hover:underline">
          Structures
        </Link>
        .
      </div>
    </Card>
  );
}

async function CorporationsContent() {
  const session = await getFullSession();
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
      {view.directorCorps.length > 0 ? <CorpSharingSettings corps={view.directorCorps} /> : null}
      <MembershipsCard view={view} />
    </>
  );
}

export default function CorporationsSettingsPage() {
  return (
    <>
      <SectionHead title="Corporations" />
      <Suspense
        fallback={<Skeleton label="Loading corporations" className="h-40 w-full rounded-card" />}
      >
        <CorporationsContent />
      </Suspense>
    </>
  );
}
