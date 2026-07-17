'use client';

import type { ReactNode } from 'react';
import { Popover, PopoverHeading } from '@/components/ui/popover';
import { HourglassIcon } from './MeAdjuster';
import { useBuildCharacter } from './planner-contexts';
import { buildSkillsView, type AppliedTimeSkill, type SkillTimeBreakdown } from '../skill-time';
import { formatBonusPct } from '../structure-bonus-view';
import type { BlueprintStructure } from '../types';

// EVE renders trained levels as roman numerals — match the in-game reading.
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'] as const;
const roman = (level: number) => ROMAN[level] ?? String(level);

// One applied-skill line: name + trained level left, its own reduction right —
// the TotalJobHover row idiom, so every skills panel reads the same way.
function SkillLine({ skill }: { skill: AppliedTimeSkill }) {
  return (
    <div className="flex items-baseline justify-between gap-3 font-mono text-micro">
      <span className="truncate text-muted">
        {skill.name} {roman(skill.level)}
      </span>
      <span className="shrink-0 tabular-nums text-text">−{formatBonusPct(skill.reductionPct)}</span>
    </div>
  );
}

// Divider + compound total — the popover's bottom line, toned to its icon.
function TotalLine({ label, totalPct, toneClass }: { label: string; totalPct: number; toneClass: string }) {
  return (
    <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-border-soft pt-1.5 font-mono text-micro">
      <span className="uppercase tracking-emphasis text-muted">{label}</span>
      <span className={`tabular-nums font-semibold ${toneClass}`}>−{formatBonusPct(totalPct)} time</span>
    </div>
  );
}

// One hourglass metric that opens its skills panel on hover/tap — the Popover
// primitive (never a bare title attr), same panel format as the other hovers.
function SkillMetric({
  label,
  icon,
  value,
  toneClass,
  children,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  toneClass: string;
  children: ReactNode;
}) {
  return (
    <Popover
      label={label}
      trigger={
        <>
          <span aria-hidden className="inline-flex h-3 w-3 shrink-0">
            {icon}
          </span>
          {value}
        </>
      }
      triggerClassName={`inline-flex cursor-pointer items-center gap-1 font-mono text-micro leading-none transition-opacity hover:opacity-80 data-[popup-open]:opacity-80 ${toneClass}`}
    >
      {children}
    </Popover>
  );
}

// The build character's skills-applied readout (3.7.19.1), filling the hero
// seam RIGHT of the Run-As frame that ACCOUNT.8 reserved for exactly this. One
// hourglass metric per activity the plan contains (time-only lever ⇒ hourglass
// only, no gem): manufacturing in the OWNED evb-bright tone, reactions in
// REACTION PURPLE (Ryan-directed token) so the two read apart at a glance.
// Hovering either opens its skills panel: the applied skills listed, the
// compound total effect at the bottom.
//
// Absolutely positioned off the frame wrapper so it has ZERO layout footprint —
// it spills into the band's reserved cluster gap and nothing reflows when it
// appears (Ryan's spec: fit the existing space, shift nothing). Renders nothing
// in EVERY degraded state (unset, pending roster, levels loading or fail-open,
// nothing trained for the plan's activities) — the readout never claims an
// effect the time figures don't carry.
// The manufacturing hourglass metric + its skills panel (activity-wide skills
// with a compound total, then the per-item T2 skills present in this plan).
function MfgSkillMetric({
  characterName,
  breakdown,
  headline,
}: {
  characterName: string;
  breakdown: SkillTimeBreakdown;
  headline: string;
}) {
  return (
    <SkillMetric
      label={`${characterName}'s manufacturing skills`}
      icon={<HourglassIcon state="owned" />}
      value={headline}
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
          <div className="font-mono text-label uppercase tracking-wide text-faint">Per-item</div>
          {breakdown.perItem.map((skill) => (
            <SkillLine key={skill.name} skill={skill} />
          ))}
          <p className="font-mono text-micro leading-snug tracking-copy text-faint">
            Applied on top of the total, only to jobs requiring the skill.
          </p>
        </div>
      )}
    </SkillMetric>
  );
}

// The reaction hourglass metric (reaction purple) + its skills panel.
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
      value={`−${formatBonusPct(breakdown.reaction.totalPct)}`}
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

/** Renders character skill levels and their time reduction for the active blueprint activity. */
export function BuildSkillsIndicator({ structure }: { structure: BlueprintStructure }) {
  const { buildCharacter, skillTimeFactors, buildCharacterSkillLevels } = useBuildCharacter();
  const view = buildSkillsView(buildCharacter, skillTimeFactors.active, buildCharacterSkillLevels, structure);
  if (view === null) return null;
  return (
    <div className="absolute left-full top-1/2 ml-2 flex -translate-y-1/2 flex-col items-start gap-3">
      {view.showMfg && (
        <MfgSkillMetric characterName={view.characterName} breakdown={view.breakdown} headline={view.mfgHeadline} />
      )}
      {view.showRxn && <RxnSkillMetric characterName={view.characterName} breakdown={view.breakdown} />}
    </div>
  );
}
