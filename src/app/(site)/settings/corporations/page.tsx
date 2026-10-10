import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { EntityRow } from '@/components/ui/row';
import { SectionPanel } from '@/components/ui/section-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { getFullSession } from '@/composition/session';
import { getCorpStructuresPageData } from '@/composition/sync/corp-structures-sync';
import { formatCount } from '@/lib/format/number';
import { accountPageSettings } from '@/platform/page-settings/account';
import { resolvePageControls } from '@/platform/page-settings/controls';
import { QuietSectionHead } from '@/components/ui/section-head';
import { CorpSharingCard } from './corp-sharing-card';
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
            <Pill tone="green" className="shrink-0 normal-case">
              {membership.roleLabel}
            </Pill>
          )}
          <Pill tone="neutral">{membership.sharingLabel}</Pill>
          {membership.structureCount !== null ? (
            <Pill tone="neutral">{formatCount(membership.structureCount, 'structure')}</Pill>
          ) : null}
        </span>
      }
    />
  );
}

function MembershipsCard({ view }: { view: CorporationsView }) {
  return (
    <SectionPanel title="Memberships" className="reveal reveal-1">
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
        Manage stations and taxes on{' '}
        <Link href="/structures" className="text-tone-blue hover:underline">
          Structures
        </Link>
        .
      </div>
    </SectionPanel>
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
      {view.memberships.length > 0 ? (
        <CorpSharingCard directorCorps={view.directorCorps} memberCorps={view.memberCorps} />
      ) : null}
      <MembershipsCard view={view} />
    </>
  );
}

export default function CorporationsSettingsPage() {
  return (
    <>
      <QuietSectionHead title="Corporations" />
      <Suspense
        fallback={<Skeleton label="Loading corporations" className="h-40 w-full rounded-card" />}
      >
        <CorporationsContent />
      </Suspense>
    </>
  );
}
