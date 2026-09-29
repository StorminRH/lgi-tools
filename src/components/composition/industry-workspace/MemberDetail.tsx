'use client';

import Link from 'next/link';
import { CharacterPortrait } from '@/components/character-portrait';
import { Button } from '@/components/ui/button';
import { ChipToggle, ChipToggleGroup } from '@/components/ui/chip-toggle';
import { Pill } from '@/components/ui/pill';
import { eyebrow } from '@/components/ui/type-roles';
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
import { SectionPanel } from '../board/SectionBody';
import { FacilityEffectsReadout, FacilityPicker, ManageStructuresLink } from './FacilityPicker';
import {
  activityOf,
  facilityEffects,
  type MemberCapacity,
  memberSkills,
  type MemberSkills,
  type RailMember,
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

function SlotRow({
  pool,
  skills,
  capacity,
}: {
  pool: JobCategory;
  skills: MemberSkills | null;
  capacity: MemberCapacity | undefined;
}) {
  const total = capacity?.capacity?.[pool] ?? null;
  const used = capacity?.used?.[pool] ?? null;
  const skillLine = skills?.slots[pool].skills.map((s) => `${s.name} ${level(s.level)}`).join(' · ');
  return (
    <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline">
      <dt className="flex min-w-0 flex-col">
        <span className="text-ui text-name">{POOL_LABELS[pool]}</span>
        {skillLine !== undefined ? <span className="font-data text-micro text-faint">{skillLine}</span> : null}
      </dt>
      <dd className="font-data text-ui tabular-nums text-name">
        {used === null ? (
          <span className="text-faint">
            {total === null ? '? slots' : `${total} ${total === 1 ? 'slot' : 'slots'}`} · in use unknown
          </span>
        ) : (
          <>
            {used}
            <span className="text-faint"> / {total ?? '?'} in use</span>
          </>
        )}
      </dd>
    </div>
  );
}

function SlotsPanel({ skills, capacity }: { skills: MemberSkills | null; capacity: MemberCapacity | undefined }) {
  const usageUnknown = capacity?.used == null;
  return (
    <SectionPanel
      title="Job slots"
      meta={
        <Link href="/jobs" className="text-isk no-underline transition-colors hover:text-name">
          Active jobs →
        </Link>
      }
    >
      <dl className="flex flex-col gap-2.5 px-3.5 py-3">
        {SLOT_POOLS.map((pool) => (
          <SlotRow key={pool} pool={pool} skills={skills} capacity={capacity} />
        ))}
      </dl>
      {usageUnknown ? (
        <p className="border-t border-border-soft px-3.5 py-2.5 text-micro text-faint">
          This character&apos;s jobs are not synced yet, so slots in use are unknown, not free.
        </p>
      ) : null}
    </SectionPanel>
  );
}

/**
 * The selected member: what they are responsible for and where, what their
 * own skills do, and their slots. Character, facility and blueprint effects
 * stay separate; nothing here adds up into one team bonus.
 */
export function MemberDetail({
  doc,
  member,
  levels,
  capacity,
  context,
  onRoles,
  onFacility,
  onRemove,
}: {
  doc: ProfileDocument;
  member: RailMember;
  levels: Record<string, number> | null;
  capacity: MemberCapacity | undefined;
  context: FacilityContext;
  onRoles: (roles: Responsibility[]) => void;
  onFacility: (responsibility: Responsibility, next: FacilityRef | null) => void;
  onRemove: () => void;
}) {
  const skills = memberSkills(levels);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex items-center gap-4">
        <CharacterPortrait
          characterId={member.characterId}
          name={member.name}
          size={112}
          src={member.portraitUrl ?? undefined}
          className="max-sm:size-16"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className={eyebrow({ size: 'micro' })}>Selected member</span>
          <h2 className="truncate font-display text-h2 font-bold leading-tight text-name">{member.name}</h2>
          {member.linked ? null : (
            <span className="flex flex-wrap items-center gap-2 text-micro text-muted">
              <Pill tone="orange">Not linked</Pill>
              Link this character again to use its skills and jobs, or remove it from the profile.
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label={`Remove ${member.name} from this profile`}
          className="shrink-0"
        >
          Remove
        </Button>
      </header>
      <div className="flex min-w-0 flex-col gap-4 xl:grid xl:grid-cols-2 xl:items-start">
        <ResponsibilitiesPanel
          doc={doc}
          member={member}
          context={context}
          onRoles={onRoles}
          onFacility={onFacility}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <SkillsPanel skills={skills} />
          <SlotsPanel skills={skills} capacity={capacity} />
        </div>
      </div>
    </div>
  );
}
