'use client';

import type { ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import type { JobCategory } from '@/features/industry-jobs/industry-jobs-styles';
import type { ProfileDocument } from '@/features/industry-planner/profiles/profile-document';
import type { AvailableStructure } from '@/features/industry-planner/types';
import { formatPct } from '@/lib/format/number';
import { SectionPanel } from '../board/SectionBody';
import { FacilitiesPanel, type HullName } from './FacilitiesPanel';
import { ProductionCapacity } from './ProductionCapacity';
import {
  type MemberCapacity,
  memberSkills,
  type MemberSkills,
  poolFigure,
  type PoolSummary,
  poolSummaries,
  type RailMember,
  SLOT_POOLS,
  SLOT_POOL_LABELS,
} from './workspace-model';

interface TeamRow {
  member: RailMember;
  skills: MemberSkills | null;
  pools: Record<JobCategory, PoolSummary>;
}

function timeCell(row: TeamRow, pct: number | undefined): ReactNode {
  if (!row.member.linked) return <span className="text-faint">—</span>;
  if (pct === undefined) return <span className="text-faint">Syncing</span>;
  return pct > 0 ? <span className="text-isk">−{formatPct(pct)}</span> : <span className="text-faint">—</span>;
}

const COLUMNS: readonly StaticTableColumn<TeamRow>[] = [
  {
    key: 'member',
    label: 'Member',
    rowHeader: true,
    render: ({ member }) => (
      <span className="flex min-w-0 items-center gap-2.5">
        <CharacterPortrait
          characterId={member.characterId}
          name={member.name}
          size={28}
          src={member.portraitUrl ?? undefined}
          className={cn(!member.linked && 'opacity-50 grayscale')}
        />
        <span className="truncate text-name">{member.name}</span>
        {member.linked ? null : <Pill tone="orange">Not linked</Pill>}
      </span>
    ),
  },
  {
    key: 'manufacturing-time',
    label: 'Manufacturing time',
    className: 'font-data',
    render: (row) => timeCell(row, row.skills?.manufacturing.totalPct),
  },
  {
    key: 'reaction-time',
    label: 'Reaction time',
    className: 'font-data',
    render: (row) => timeCell(row, row.skills?.reactions.totalPct),
  },
  ...SLOT_POOLS.map(
    (pool): StaticTableColumn<TeamRow> => ({
      key: pool,
      label: SLOT_POOL_LABELS[pool],
      align: 'right',
      className: 'font-data text-name',
      render: (row) => (row.member.linked ? poolFigure(row.pools[pool]) : <span className="text-faint">—</span>),
    }),
  ),
];

/**
 * Each member's general job-time skills and slots side by side. Slots read
 * used over total, as the capacity panel does, with "?" for what is unknown.
 */
function TeamSkillsPanel({
  members,
  levels,
  capacities,
}: {
  members: readonly RailMember[];
  levels: ReadonlyMap<number, Record<string, number> | null>;
  capacities: ReadonlyMap<number, MemberCapacity>;
}) {
  const rows = members.map((member) => ({
    member,
    skills: member.linked ? memberSkills(levels.get(member.characterId) ?? null) : null,
    pools: poolSummaries([member.characterId], capacities),
  }));
  return (
    <SectionPanel title="Production skills">
      {rows.length === 0 ? (
        <p className="px-3.5 py-3 text-ui text-muted">
          No one is on this profile yet. Add a linked character to assign what they build.
        </p>
      ) : (
        <div className="overflow-x-auto px-1.5">
          <StaticTable
            columns={COLUMNS}
            rows={rows}
            getRowKey={(row) => row.member.characterId}
            ariaLabel="Production skills by member"
            className="min-w-[38rem]"
          />
        </div>
      )}
    </SectionPanel>
  );
}

/**
 * The whole profile with no member open: every member's skills and slots,
 * and the facilities the profile builds in.
 */
export function ProfileOverview({
  members,
  levels,
  capacities,
  doc,
  structures,
  hulls,
  onEdit,
}: {
  members: readonly RailMember[];
  levels: ReadonlyMap<number, Record<string, number> | null>;
  capacities: ReadonlyMap<number, MemberCapacity>;
  doc: ProfileDocument;
  structures: readonly AvailableStructure[] | null;
  hulls: readonly HullName[];
  onEdit: (next: ProfileDocument) => void;
}) {
  return (
    <div role="region" aria-label="Profile overview" className="flex min-w-0 flex-col gap-4">
      <ProductionCapacity members={members} capacities={capacities} />
      <TeamSkillsPanel members={members} levels={levels} capacities={capacities} />
      <FacilitiesPanel doc={doc} structures={structures} hulls={hulls} onEdit={onEdit} />
    </div>
  );
}
