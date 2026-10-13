'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { EntityRow } from '@/components/ui/row';
import { SectionPanel } from '@/components/ui/section-panel';
import { inlineLink } from '@/components/ui/text-link';
import type { CorpStructurePageView } from '@/features/owned-structures/types';
import { useCorpStructuresLive } from '@/features/owned-structures/use-corp-structures-live';
import { formatCount } from '@/lib/format/number';
import { CorpSharingCard } from './corp-sharing-card';
import { type CorporationMembershipView, type CorporationsView, deriveCorporationsView } from './corporations-view';

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
        <Link href="/industry?panel=structures" className={inlineLink}>
          Structures
        </Link>
        .
      </div>
    </SectionPanel>
  );
}

/** The memberships and sharing cards over the server's first draw, with newer corp data streaming in. */
export function CorporationsLive({ initial }: { initial: CorpStructurePageView[] }) {
  const { corporations } = useCorpStructuresLive(initial);
  const view = useMemo(() => deriveCorporationsView(corporations), [corporations]);
  return (
    <>
      {view.memberships.length > 0 ? (
        <CorpSharingCard directorCorps={view.directorCorps} memberCorps={view.memberCorps} />
      ) : null}
      <MembershipsCard view={view} />
    </>
  );
}
