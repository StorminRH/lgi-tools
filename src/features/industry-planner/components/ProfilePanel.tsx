'use client';

import { cn } from '@/components/ui/cn';
import { Select } from '@/components/ui/select';
import { HERO_LOCATION_CONTROL_WELL_CLASS, HERO_LOCATION_GROUP_CLASS } from '../industry-styles';
import { planSummary } from '../profiles/profile-plan';
import type { BlueprintStructure } from '../types';
import { useBuildSetup } from './planner-contexts';

const jobs = (n: number) => `${n} ${n === 1 ? 'job' : 'jobs'}`;

function Routes({ structure }: { structure: BlueprintStructure }) {
  const { profile, profilePlan } = useBuildSetup();
  if (profile === null || profilePlan === null) return null;
  const summary = planSummary(profilePlan, [
    structure.blueprintTypeId,
    ...Object.keys(structure.nodeActivityByBlueprint).map(Number),
  ]);
  const nameOf = (characterId: number) =>
    profile.document.members.find((m) => m.characterId === characterId)?.name ?? `Character ${characterId}`;
  return (
    <div className="flex flex-col gap-2 font-data text-micro">
      <ul aria-label="Facilities" className="flex flex-col gap-1">
        {summary.facilities.map(({ facility, jobs: n }) => (
          <li key={facility.key} className="flex min-w-0 items-baseline justify-between gap-3">
            <span className="truncate text-name">{facility.name}</span>
            <span className="shrink-0 text-muted">{jobs(n)}</span>
          </li>
        ))}
        {summary.uncovered > 0 ? (
          <li className="flex min-w-0 items-baseline justify-between gap-3 text-tone-orange">
            <span className="truncate">No facility</span>
            <span className="shrink-0">{jobs(summary.uncovered)}</span>
          </li>
        ) : null}
      </ul>
      <ul aria-label="Members" className="flex flex-col gap-1 border-t border-border-soft pt-2">
        {summary.members.map(({ characterId, jobs: n }) => (
          <li key={characterId} className="flex min-w-0 items-baseline justify-between gap-3">
            <span className="truncate text-muted">{nameOf(characterId)}</span>
            <span className="shrink-0 text-muted">{jobs(n)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Builds the blueprint under one of the account's production profiles: each
 * job runs at the facility and with the character the profile gives its
 * category. With no profile the planner's own picks apply.
 */
export function ProfilePanel({ structure }: { structure: BlueprintStructure }) {
  const { profiles, profile, setProfileId } = useBuildSetup();
  if (profiles === null || profiles.length === 0) return null;
  return (
    <div className={HERO_LOCATION_GROUP_CLASS}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="w-[64px] shrink-0 text-label uppercase tracking-eyebrow text-text">Profile</span>
        <Select
          ariaLabel="Production profile"
          value={profile?.id ?? ''}
          items={[{ value: '', label: 'None' }, ...profiles.map((p) => ({ value: p.id, label: p.name }))]}
          onValueChange={(value) => setProfileId(value === '' ? null : value)}
          className={cn('h-[30px]', HERO_LOCATION_CONTROL_WELL_CLASS)}
        />
      </div>
      <Routes structure={structure} />
    </div>
  );
}
