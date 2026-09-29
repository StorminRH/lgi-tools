'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import type { JobCategory } from '@/features/industry-jobs/industry-jobs-styles';
import type { FacilityRef, ProfileDocument } from '@/features/industry-planner/profiles/profile-document';
import { RESPONSIBILITY_LABELS } from '@/features/industry-planner/profiles/responsibilities';
import type { AvailableStructure } from '@/features/industry-planner/types';
import { KpiTile } from '../board/board-bits';
import { SectionPanel } from '../board/SectionBody';
import { FacilityPicker } from './FacilityPicker';
import { freeSlots, type PoolSummary, type ProfileSummary as Summary, SLOT_POOLS } from './workspace-model';

const POOL_LABELS: Record<JobCategory, string> = {
  manufacturing: 'Manufacturing slots',
  reactions: 'Reaction slots',
  science: 'Science slots',
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Used over capacity when usage is known; capacity alone otherwise. "+" marks capacity still syncing. */
function poolFigure(pool: PoolSummary): string {
  const capacity = pool.unknownCapacity > 0 ? `${pool.capacity}+` : String(pool.capacity);
  return pool.unknownUsed > 0 ? capacity : `${pool.used}/${capacity}`;
}

function poolNote(pool: PoolSummary): string {
  const free = freeSlots(pool);
  if (free !== null) return `${free} free`;
  if (pool.unknownUsed > 0) return 'In use unknown';
  return `${pool.used} in use · skills syncing`;
}

export function SummaryTiles({ summary }: { summary: Summary }) {
  const covered = summary.coverage.filter((c) => c.resolution.status === 'assigned').length;
  const unlinked = summary.unlinkedMembers.length;
  const missing = summary.missingFacilities.length;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        label="Members"
        note={unlinked > 0 ? `${unlinked} not linked` : undefined}
        noteTone="text-dps-mid"
      >
        {summary.memberCount}
      </KpiTile>
      <KpiTile
        label="Covered"
        note={covered < summary.coverage.length ? 'Some jobs unassigned' : 'Every responsibility'}
        noteTone={covered < summary.coverage.length ? 'text-dps-mid' : 'text-isk'}
      >
        {covered}/{summary.coverage.length}
      </KpiTile>
      <KpiTile
        label="Facilities"
        note={missing > 0 ? `${missing} unavailable` : undefined}
        noteTone="text-dps-mid"
      >
        {summary.facilityCount}
      </KpiTile>
      {SLOT_POOLS.map((pool) => (
        <KpiTile
          key={pool}
          label={POOL_LABELS[pool]}
          note={poolNote(summary.pools[pool])}
          noteTone={freeSlots(summary.pools[pool]) === null ? 'text-muted' : 'text-isk'}
        >
          {poolFigure(summary.pools[pool])}
        </KpiTile>
      ))}
    </dl>
  );
}

function CoverageRow({
  label,
  children,
  warn,
}: {
  label: string;
  children: ReactNode;
  warn: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border-soft px-3.5 py-2.5 first:border-t-0">
      <dt className="text-ui text-name">{label}</dt>
      <dd className={warn ? 'text-right text-ui text-dps-mid' : 'text-right text-ui text-muted'}>{children}</dd>
    </div>
  );
}

function CoveragePanel({
  summary,
  doc,
  nameOf,
  structures,
  onDefault,
}: {
  summary: Summary;
  doc: ProfileDocument;
  nameOf: (characterId: number) => string;
  structures: readonly AvailableStructure[] | null;
  onDefault: (activity: 'manufacturing' | 'reactions', next: FacilityRef | null) => void;
}) {
  return (
    <SectionPanel title="Who does what">
      <dl>
        {summary.coverage.map(({ responsibility, resolution }) => (
          <CoverageRow
            key={responsibility}
            label={RESPONSIBILITY_LABELS[responsibility]}
            warn={resolution.status === 'unassigned'}
          >
            {resolution.status === 'assigned'
              ? `${nameOf(resolution.characterId)}${resolution.alternates.length > 0 ? ` + ${resolution.alternates.length} more` : ''}`
              : 'No one assigned'}
          </CoverageRow>
        ))}
      </dl>
      <div className="flex flex-col gap-2 border-t border-border-soft px-3.5 py-3">
        <span className="text-micro text-faint">
          Default facilities, used when a responsibility has no facility of its own
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span aria-hidden className="text-micro text-muted">Manufacturing</span>
            <FacilityPicker
              label="Default manufacturing facility"
              value={doc.defaults.manufacturingFacility}
              structures={structures}
              activity="manufacturing"
              noneLabel="None"
              onChange={(next) => onDefault('manufacturing', next)}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span aria-hidden className="text-micro text-muted">Reactions</span>
            <FacilityPicker
              label="Default reaction facility"
              value={doc.defaults.reactionFacility}
              structures={structures}
              activity="reactions"
              noneLabel="None"
              onChange={(next) => onDefault('reactions', next)}
            />
          </div>
        </div>
      </div>
    </SectionPanel>
  );
}

interface AttentionItem {
  key: string;
  text: string;
  action?: { label: string; characterId: number } | { label: string; href: string };
}

function AttentionAction({
  action,
  onSelectCharacter,
}: {
  action: AttentionItem['action'];
  onSelectCharacter: (characterId: number) => void;
}) {
  if (action === undefined) return null;
  if ('href' in action) {
    return (
      <Link href={action.href} className="shrink-0 text-micro text-isk no-underline hover:text-name">
        {action.label} →
      </Link>
    );
  }
  return (
    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onSelectCharacter(action.characterId)}>
      {action.label}
    </Button>
  );
}

function attentionItems(summary: Summary, nameOf: (characterId: number) => string): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const { responsibility, resolution } of summary.coverage) {
    if (resolution.status !== 'unassigned') continue;
    const label = RESPONSIBILITY_LABELS[responsibility];
    items.push({
      key: `uncovered-${responsibility}`,
      text:
        resolution.unavailable.length > 0
          ? `${label} is held only by characters that are not linked.`
          : `No one is responsible for ${label.toLowerCase()}.`,
    });
  }
  for (const member of summary.unlinkedMembers) {
    items.push({
      key: `unlinked-${member.characterId}`,
      text: `${member.name} is no longer linked to your account.`,
      action: { label: 'Review', characterId: member.characterId },
    });
  }
  for (const missing of summary.missingFacilities) {
    const who = missing.characterId === null ? 'the profile default' : nameOf(missing.characterId);
    items.push({
      key: `facility-${missing.facility.id}-${missing.characterId ?? 'default'}-${missing.responsibility ?? ''}`,
      text: `${missing.facility.name} (${who}) is no longer available.`,
      action:
        missing.characterId === null
          ? { label: 'Structures', href: '/structures' }
          : { label: 'Review', characterId: missing.characterId },
    });
  }
  return items;
}

function dataLine(summary: Summary): string | null {
  const parts: string[] = [];
  if (summary.skillsPending.length > 0) {
    parts.push(`skills for ${plural(summary.skillsPending.length, 'member')} are still syncing`);
  }
  if (summary.jobsPending.length > 0) {
    parts.push(`jobs for ${plural(summary.jobsPending.length, 'member')} are not synced`);
  }
  if (parts.length === 0) return null;
  const sentence = parts.join('; ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}. Unknown slots are shown as unknown, not free.`;
}

function asOfLabel(asOf: number | null): string | null {
  if (asOf === null) return null;
  return `Jobs as of ${new Date(asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function accountLine(summary: Summary, linkedCount: number): string {
  const figures = SLOT_POOLS.map((pool) => {
    const label = POOL_LABELS[pool].replace(' slots', '').toLowerCase();
    return `${label} ${poolFigure(summary.account[pool])}`;
  });
  return `All ${plural(linkedCount, 'linked character')}: ${figures.join(' · ')}.`;
}

function AttentionPanel({
  summary,
  linkedCount,
  nameOf,
  onSelectCharacter,
}: {
  summary: Summary;
  linkedCount: number;
  nameOf: (characterId: number) => string;
  onSelectCharacter: (characterId: number) => void;
}) {
  const items = attentionItems(summary, nameOf);
  const data = dataLine(summary);
  const asOf = asOfLabel(summary.jobsAsOf);
  return (
    <SectionPanel title="Needs attention" meta={asOf ?? undefined}>
      {items.length === 0 ? (
        <p className="px-3.5 py-3 text-ui text-muted">Nothing missing on this profile.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between gap-3 border-t border-border-soft px-3.5 py-2 text-ui text-text first:border-t-0"
            >
              <span className="min-w-0">{item.text}</span>
              <AttentionAction action={item.action} onSelectCharacter={onSelectCharacter} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-1 border-t border-border-soft px-3.5 py-2.5 text-micro text-faint">
        {data !== null ? <span>{data}</span> : null}
        <span>
          {accountLine(summary, linkedCount)} Profiles are views of the same characters, so a character in
          two profiles is the same slots seen twice.
        </span>
      </div>
    </SectionPanel>
  );
}

/**
 * Who covers each responsibility, the profile's default facilities, and what
 * is missing or unknown, next to the whole account's slots. No universal
 * efficiency score; product-specific effects belong to a plan.
 */
export function ProfileSummaryPanels({
  summary,
  doc,
  linkedCount,
  nameOf,
  structures,
  onDefault,
  onSelectCharacter,
  className,
}: {
  summary: Summary;
  doc: ProfileDocument;
  linkedCount: number;
  nameOf: (characterId: number) => string;
  structures: readonly AvailableStructure[] | null;
  onDefault: (activity: 'manufacturing' | 'reactions', next: FacilityRef | null) => void;
  onSelectCharacter: (characterId: number) => void;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-4 lg:grid-cols-2 lg:items-start', className)}>
      <CoveragePanel summary={summary} doc={doc} nameOf={nameOf} structures={structures} onDefault={onDefault} />
      <AttentionPanel
        summary={summary}
        linkedCount={linkedCount}
        nameOf={nameOf}
        onSelectCharacter={onSelectCharacter}
      />
    </div>
  );
}
