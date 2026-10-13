'use client';

import { type ReactNode, type Ref, ViewTransition } from 'react';
import type { BoardCharacter } from '@/composition/board/api-contract';
import { CharacterIdentity } from '../board/sections/CharacterIdentity';
import { backAction, Button } from '@/components/ui/button';
import { characterPortraitUrl } from '@/lib/eve-image';
import { Pill } from '@/components/ui/pill';
import { SectionPanel } from '@/components/ui/section-panel';
import type { CategoryKey } from '@/features/industry-planner/profiles/production-categories';
import { romanLevel } from '@/features/skill-queue/progress';
import { formatPct } from '@/lib/format/number';
import { PANELS_MOTION, SHEET_MOTION } from '../board/board-motion';
import { SectionNote } from '../board/SectionBody';
import { CategoryChecklist } from './CategoryChecklist';
import { ProductionCapacity } from './ProductionCapacity';
import {
  type MemberCapacity,
  memberSkills,
  type MemberSkills,
  type RailMember,
} from './workspace-model';

function MemberCategories({
  member,
  onCategories,
}: {
  member: RailMember;
  onCategories: (categories: CategoryKey[]) => void;
}) {
  return (
    <SectionPanel title="Builds">
      <div className="px-3.5 py-3">
        <CategoryChecklist label={`What ${member.name} builds`} categories={member.categories} onChange={onCategories} />
      </div>
    </SectionPanel>
  );
}

function TimeSkillRow({
  label,
  group,
}: {
  label: string;
  group: MemberSkills['manufacturing'];
}) {
  return (
    <div className="flex flex-col gap-2">
      <dt className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-ui text-name">
        <span>{label}</span>
        <span className="font-data text-isk">{group.totalPct > 0 ? `−${formatPct(group.totalPct)}` : '—'}</span>
      </dt>
      <dd className="text-ui text-muted">
        {group.skills.length === 0 ? (
          'No time skills trained'
        ) : (
          <ul className="flex flex-col gap-1">
            {group.skills.map((skill) => (
              <li key={skill.name} className="flex items-baseline justify-between gap-3">
                <span>{skill.name}</span>
                <span className="font-data">{romanLevel(skill.level)}</span>
              </li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  );
}

function SkillsPanel({ skills }: { skills: MemberSkills | null }) {
  return (
    <SectionPanel title="Production skills">
      {skills === null ? (
        <SectionNote>Skills are still syncing from EVE.</SectionNote>
      ) : (
        <div className="flex flex-col gap-3 px-3.5 py-3">
          <dl className="flex flex-col gap-4">
            <TimeSkillRow label="Manufacturing time" group={skills.manufacturing} />
            <TimeSkillRow label="Reaction time" group={skills.reactions} />
          </dl>
        </div>
      )}
    </SectionPanel>
  );
}

function MemberHeader({
  character,
  now,
  member,
  skills,
  onRemove,
}: {
  character: BoardCharacter | null;
  now: number;
  member: RailMember;
  skills: MemberSkills | null;
  onRemove: () => void;
}) {
  return (
    <header className="flex flex-col gap-5">
      <CharacterIdentity
        character={member.linked && character !== null ? character : {
          characterId: member.characterId,
          name: member.name,
          portraitUrl: member.portraitUrl ?? characterPortraitUrl(member.characterId, 128),
          corporation: null,
          alliance: null,
          profile: { state: 'pending' },
          status: { state: 'pending' },
        }}
        now={now}
        dimmed={!member.linked}
      />
      {member.linked ? null : (
        <p className="flex flex-col items-start gap-2 text-micro text-muted">
          <Pill tone="orange">Not linked</Pill>
          Link this character again to use its skills and jobs, or remove it from the profile.
        </p>
      )}
      {member.linked ? <SkillsPanel skills={skills} /> : null}
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        aria-label={`Remove ${member.name} from this profile`}
        className="self-start"
      >
        Remove from profile
      </Button>
    </header>
  );
}

/**
 * One member opened from the rail: identity and production skills on the
 * left, capacity and what they build on the right. Each part is a direct child of the
 * caller's persistent container: React runs enter and exit only on a
 * <ViewTransition> with no new DOM node above it.
 */
export function MemberSheet({
  character,
  now,
  controls,
  member,
  levels,
  capacities,
  onBack,
  backRef,
  onCategories,
  onRemove,
}: {
  controls: ReactNode;
  character: BoardCharacter | null;
  now: number;
  member: RailMember;
  levels: Record<string, number> | null;
  capacities: ReadonlyMap<number, MemberCapacity>;
  onBack: () => void;
  backRef: Ref<HTMLButtonElement>;
  onCategories: (categories: CategoryKey[]) => void;
  onRemove: () => void;
}) {
  const skills = member.linked ? memberSkills(levels) : null;
  return (
    <>
      <ViewTransition {...SHEET_MOTION} default="none">
        <div className="flex min-w-0 flex-col gap-6">
          {controls}
          <Button ref={backRef} variant="bare" onClick={onBack} className={backAction}>
            <span aria-hidden>←</span> All members
          </Button>
          <MemberHeader character={character} now={now} member={member} skills={skills} onRemove={onRemove} />
        </div>
      </ViewTransition>
      <ViewTransition {...PANELS_MOTION} default="none">
        <div className="flex min-w-0 flex-col gap-4 self-start">
          <ProductionCapacity members={[member]} capacities={capacities} />
          <MemberCategories member={member} onCategories={onCategories} />
        </div>
      </ViewTransition>
    </>
  );
}
