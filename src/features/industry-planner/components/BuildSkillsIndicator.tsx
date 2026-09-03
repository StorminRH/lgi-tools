'use client';

import type { ReactNode } from 'react';
import { Popover, PopoverHeading } from '@/components/ui/popover';
import { HourglassIcon } from './MeAdjuster';
import { useBuildCharacter } from './planner-contexts';
import { buildSkillsView, type AppliedTimeSkill, type SkillTimeBreakdown } from '../skill-time';
import { formatBonusPct } from '../structure-bonus-view';
import type { BlueprintStructure } from '../types';

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'] as const;
const roman = (level: number) => ROMAN[level] ?? String(level);

function SkillLine({ skill }: { skill: AppliedTimeSkill }) {
  return (
    <div className="flex items-baseline justify-between gap-3 font-data text-micro">
      <span className="truncate text-muted">
        {skill.name} {roman(skill.level)}
      </span>
      <span className="shrink-0 tabular-nums text-text">−{formatBonusPct(skill.reductionPct)}</span>
    </div>
  );
}

function TotalLine({ label, totalPct, toneClass }: { label: string; totalPct: number; toneClass: string }) {
  return (
    <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-border-soft pt-1.5 font-data text-micro">
      <span className="uppercase tracking-wide text-muted">{label}</span>
      <span className={`tabular-nums font-semibold ${toneClass}`}>−{formatBonusPct(totalPct)} time</span>
    </div>
  );
}

function SkillMetric({
  label,
  icon,
  toneClass,
  children,
}: {
  label: string;
  icon: ReactNode;
  toneClass: string;
  children: ReactNode;
}) {
  return (
    <Popover
      label={label}
      trigger={
        <span aria-hidden className="inline-flex h-3.5 w-3.5 shrink-0">
          {icon}
        </span>
      }
      triggerClassName={`inline-flex size-5 cursor-pointer items-center justify-center rounded-ctl border border-current/35 bg-surface-sunk transition-colors hover:bg-row-active focus-visible:ring-1 focus-visible:ring-current ${toneClass}`}
    >
      {children}
    </Popover>
  );
}

function MfgSkillMetric({
  characterName,
  breakdown,
}: {
  characterName: string;
  breakdown: SkillTimeBreakdown;
}) {
  return (
    <SkillMetric
      label={`${characterName}'s manufacturing skills`}
      icon={<HourglassIcon state="owned" />}
      toneClass="text-evb-bright"
    >
      <PopoverHeading>{characterName} — manufacturing</PopoverHeading>
      {breakdown.manufacturing.skills.length > 0 && (
        <div className="flex flex-col gap-1">
          {breakdown.manufacturing.skills.map((skill) => (
            <SkillLine key={skill.name} skill={skill} />
          ))}
          <TotalLine label="All mfg jobs" totalPct={breakdown.manufacturing.totalPct} toneClass="text-evb-bright" />
        </div>
      )}
      {breakdown.perItem.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-label uppercase tracking-wide text-faint">Per-item</div>
          {breakdown.perItem.map((skill) => (
            <SkillLine key={skill.name} skill={skill} />
          ))}
          <p className="text-micro leading-snug tracking-copy text-faint">
            Applied on top of the total, only to jobs requiring the skill.
          </p>
        </div>
      )}
    </SkillMetric>
  );
}

function RxnSkillMetric({
  characterName,
  breakdown,
}: {
  characterName: string;
  breakdown: SkillTimeBreakdown;
}) {
  return (
    <SkillMetric
      label={`${characterName}'s reaction skills`}
      icon={<HourglassIcon state="reaction" />}
      toneClass="text-[var(--color-reaction-purple)]"
    >
      <PopoverHeading>{characterName} — reactions</PopoverHeading>
      <div className="flex flex-col gap-1">
        {breakdown.reaction.skills.map((skill) => (
          <SkillLine key={skill.name} skill={skill} />
        ))}
        <TotalLine
          label="All reaction jobs"
          totalPct={breakdown.reaction.totalPct}
          toneClass="text-[var(--color-reaction-purple)]"
        />
      </div>
    </SkillMetric>
  );
}

export function BuildSkillsIndicator({ structure }: { structure: BlueprintStructure }) {
  const { buildCharacter, skillTimeFactors, buildCharacterSkillLevels } = useBuildCharacter();
  const view = buildSkillsView(buildCharacter, skillTimeFactors.active, buildCharacterSkillLevels, structure);
  if (view === null) return null;
  return (
    <div className="absolute left-full top-1/2 ml-2 flex -translate-y-1/2 flex-col items-start gap-3">
      {view.showMfg && (
        <MfgSkillMetric characterName={view.characterName} breakdown={view.breakdown} />
      )}
      {view.showRxn && <RxnSkillMetric characterName={view.characterName} breakdown={view.breakdown} />}
    </div>
  );
}
