'use client';

import Link from 'next/link';
import { type Ref, ViewTransition } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { Button } from '@/components/ui/button';
import { ChipToggle, ChipToggleGroup } from '@/components/ui/chip-toggle';
import { Pill } from '@/components/ui/pill';
import type { SecurityClass } from '@/data/eve-data/security';
import type { JobCategory } from '@/features/industry-jobs/industry-jobs-styles';
import {
  type FacilityRef,
  type ProfileDocument,
  RESPONSIBILITIES,
  type Responsibility,
} from '@/features/industry-planner/profiles/profile-document';
import {
  defaultFacilityFor,
  RESPONSIBILITY_LABELS,
} from '@/features/industry-planner/profiles/responsibilities';
import { formatBonusPct } from '@/features/industry-planner/structure-bonus-view';
import type { AvailableStructure } from '@/features/industry-planner/types';
import { PANELS_MOTION, pilotTransitionName, SHEET_MOTION } from '../board/board-motion';
import { SectionPanel } from '../board/SectionBody';
import { FacilityEffectsReadout, FacilityPicker, ManageStructuresLink } from './FacilityPicker';
import { PoolTiles } from './ProfileSummary';
import {
  activityOf,
  facilityEffects,
  type MemberCapacity,
  memberSkills,
  type MemberSkills,
  poolSummaries,
  type RailMember,
  roleLine,
  SLOT_POOLS,
} from './workspace-model';

const POOL_LABELS: Record<JobCategory, string> = {
  manufacturing: 'Manufacturing',
  reactions: 'Reactions',
  science: 'Science',
};

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'] as const;

function level(n: number): string {
  return ROMAN[n] ?? String(n);
}

export interface FacilityContext {
  structures: readonly AvailableStructure[] | null;
  securityOf: (systemId: number | null) => SecurityClass | null;
}

function ResponsibilityRow({
  responsibility,
  facility,
  fallback,
  context,
  onFacility,
}: {
  responsibility: Responsibility;
  facility: FacilityRef | null;
  fallback: FacilityRef | null;
  context: FacilityContext;
  onFacility: (next: FacilityRef | null) => void;
}) {
  const activity = activityOf(responsibility);
  const effective = facility ?? fallback;
  const structure = context.structures?.find((s) => s.id === effective?.id) ?? null;
  const label = RESPONSIBILITY_LABELS[responsibility];
  return (
    <li className="flex flex-col gap-2 border-t border-border-soft px-3.5 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="font-display text-nav font-bold text-name">{label}</span>
        <div className="w-full sm:w-72">
          <FacilityPicker
            label={`${label} facility`}
            value={facility}
            structures={context.structures}
            activity={activity}
            noneLabel={fallback === null ? 'No preferred facility' : `Profile default: ${fallback.name}`}
            onChange={onFacility}
          />
        </div>
      </div>
      {structure !== null ? (
        <FacilityEffectsReadout
          activity={activity}
          effects={facilityEffects(structure, activity, context.securityOf(structure.systemId))}
        />
      ) : (
        <p className="text-micro text-faint">
          {effective === null
            ? 'No facility chosen. Jobs for this responsibility have no facility bonus assumed.'
            : `${effective.name} is no longer available to this account.`}
        </p>
      )}
    </li>
  );
}

function ResponsibilitiesPanel({
  doc,
  member,
  context,
  onRoles,
  onFacility,
}: {
  doc: ProfileDocument;
  member: RailMember;
  context: FacilityContext;
  onRoles: (roles: Responsibility[]) => void;
  onFacility: (responsibility: Responsibility, next: FacilityRef | null) => void;
}) {
  const rules = doc.rules.filter((rule) => rule.characterId === member.characterId);
  return (
    <SectionPanel title="Responsibilities" meta={<ManageStructuresLink />}>
      <div className="flex flex-col gap-2 px-3.5 py-3">
        <ChipToggleGroup
          label={`${member.name}'s responsibilities`}
          value={member.roles}
          onValueChange={(next) => onRoles(RESPONSIBILITIES.filter((r) => next.includes(r)))}
        >
          {RESPONSIBILITIES.map((responsibility) => (
            <ChipToggle key={responsibility} tone="green" appearance="filter" value={responsibility}>
              <span aria-hidden className="mr-1 inline-block w-2.5">
                {member.roles.includes(responsibility) ? '✓' : '+'}
              </span>
              {RESPONSIBILITY_LABELS[responsibility]}
            </ChipToggle>
          ))}
        </ChipToggleGroup>
        <p className="text-micro text-faint">
          Responsibilities say who you would route these jobs to. They do not check that this character
          can build every item.
        </p>
      </div>
      {rules.length > 0 ? (
        <ul className="border-t border-border-soft">
          {RESPONSIBILITIES.flatMap((responsibility) => {
            const rule = rules.find((r) => r.responsibility === responsibility);
            if (rule === undefined) return [];
            return [
              <ResponsibilityRow
                key={responsibility}
                responsibility={responsibility}
                facility={rule.facility}
                fallback={defaultFacilityFor(doc, responsibility)}
                context={context}
                onFacility={(next) => onFacility(responsibility, next)}
              />,
            ];
          })}
        </ul>
      ) : null}
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
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <dt className="text-ui text-name">{label}</dt>
      <dd className="font-data text-ui text-muted">
        {group.skills.length === 0
          ? 'No time skills trained'
          : group.skills.map((s) => `${s.name} ${level(s.level)}`).join(' · ')}
        <span className="ml-3 text-isk">{group.totalPct > 0 ? `−${formatBonusPct(group.totalPct)} time` : '—'}</span>
      </dd>
    </div>
  );
}

function SkillsPanel({ skills }: { skills: MemberSkills | null }) {
  return (
    <SectionPanel title="Production skills">
      {skills === null ? (
        <p className="px-3.5 py-3 text-ui text-faint">Skills are still syncing from EVE.</p>
      ) : (
        <div className="flex flex-col gap-3 px-3.5 py-3">
          <dl className="flex flex-col gap-2">
            <TimeSkillRow label="Manufacturing time" group={skills.manufacturing} />
            <TimeSkillRow label="Reaction time" group={skills.reactions} />
          </dl>
          <p className="text-micro text-faint">
            Science and racial engineering skills cut time for particular blueprints. They show in the
            planner once a product is chosen.
          </p>
        </div>
      )}
    </SectionPanel>
  );
}

function SlotRow({ pool, skills }: { pool: JobCategory; skills: MemberSkills }) {
  const { capacity, skills: slotSkills } = skills.slots[pool];
  return (
    <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline">
      <dt className="flex min-w-0 flex-col">
        <span className="text-ui text-name">{POOL_LABELS[pool]}</span>
        <span className="font-data text-micro text-faint">
          {slotSkills.map((s) => `${s.name} ${level(s.level)}`).join(' · ')}
        </span>
      </dt>
      <dd className="font-data text-ui tabular-nums text-name">
        {capacity} {capacity === 1 ? 'slot' : 'slots'}
      </dd>
    </div>
  );
}

function SlotsPanel({ skills }: { skills: MemberSkills | null }) {
  return (
    <SectionPanel
      title="Job slots"
      meta={
        <Link href="/jobs" className="text-isk no-underline transition-colors hover:text-name">
          Active jobs →
        </Link>
      }
    >
      {skills === null ? (
        <p className="px-3.5 py-3 text-ui text-faint">Skills are still syncing from EVE.</p>
      ) : (
        <dl className="flex flex-col gap-2.5 px-3.5 py-3">
          {SLOT_POOLS.map((pool) => (
            <SlotRow key={pool} pool={pool} skills={skills} />
          ))}
        </dl>
      )}
    </SectionPanel>
  );
}

function MemberHeader({
  member,
  capacities,
  onRemove,
}: {
  member: RailMember;
  capacities: ReadonlyMap<number, MemberCapacity>;
  onRemove: () => void;
}) {
  return (
    <header className="flex flex-col gap-5">
      <div className="flex items-center gap-4 xl:flex-col xl:items-start">
        <ViewTransition name={pilotTransitionName(member.characterId)} share="morph" default="none">
          <CharacterPortrait
            characterId={member.characterId}
            name={member.name}
            size={160}
            src={member.portraitUrl ?? undefined}
            className={member.linked ? 'shadow-cta-glow max-xl:size-24' : 'opacity-50 grayscale max-xl:size-24'}
          />
        </ViewTransition>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="font-display text-h2 font-bold leading-tight text-name">{member.name}</h2>
          <span className="font-data text-micro text-muted">{roleLine(member)}</span>
        </div>
      </div>
      {member.linked ? (
        <dl aria-label={`${member.name}'s job slots`} className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1">
          <PoolTiles pools={poolSummaries([member.characterId], capacities)} />
        </dl>
      ) : (
        <p className="flex flex-col items-start gap-2 text-micro text-muted">
          <Pill tone="orange">Not linked</Pill>
          Link this character again to use its skills and jobs, or remove it from the profile.
        </p>
      )}
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
 * One member opened from the rail: who they are and their slots on the left,
 * what they are responsible for and where, and their own skills, on the
 * right. Character, facility and blueprint effects stay separate; nothing
 * here adds up into one team bonus. Each part is a direct child of the
 * caller's persistent container: React runs enter and exit only on a
 * <ViewTransition> with no new DOM node above it.
 */
export function MemberSheet({
  doc,
  member,
  levels,
  capacities,
  context,
  onBack,
  backRef,
  onRoles,
  onFacility,
  onRemove,
}: {
  doc: ProfileDocument;
  member: RailMember;
  levels: Record<string, number> | null;
  capacities: ReadonlyMap<number, MemberCapacity>;
  context: FacilityContext;
  onBack: () => void;
  backRef: Ref<HTMLButtonElement>;
  onRoles: (roles: Responsibility[]) => void;
  onFacility: (responsibility: Responsibility, next: FacilityRef | null) => void;
  onRemove: () => void;
}) {
  const skills = member.linked ? memberSkills(levels) : null;
  return (
    <>
      <ViewTransition {...SHEET_MOTION} default="none">
        <div className="xl:col-span-2">
          <Button
            ref={backRef}
            variant="bare"
            onClick={onBack}
            className="gap-2 rounded-ctl py-1 font-data text-ui text-muted hover:text-isk"
          >
            <span aria-hidden>←</span> All members
          </Button>
        </div>
      </ViewTransition>
      <ViewTransition {...SHEET_MOTION} default="none">
        <MemberHeader member={member} capacities={capacities} onRemove={onRemove} />
      </ViewTransition>
      <ViewTransition {...PANELS_MOTION} default="none">
        <div className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
          <ResponsibilitiesPanel
            doc={doc}
            member={member}
            context={context}
            onRoles={onRoles}
            onFacility={onFacility}
          />
          <div className="flex min-w-0 flex-col gap-4">
            <SkillsPanel skills={skills} />
            <SlotsPanel skills={skills} />
          </div>
        </div>
      </ViewTransition>
    </>
  );
}
