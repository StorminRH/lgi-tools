'use client';

import { Select, type SelectItems } from '@/components/ui/select';
import { structureOptionGroups } from '@/features/industry-planner/components/structure-options';
import { facilityValueFor } from '@/features/industry-planner/facility-value';
import { hostsReactions } from '@/features/industry-planner/structure-factors';
import type { AvailableStructure } from '@/features/industry-planner/types';
import type { FacilityRef } from '@/features/industry-planner/profiles/profile-document';
import { facilityForValue, type ResponsibilityActivity } from './workspace-model';

function facilityItems(
  structures: readonly AvailableStructure[] | null,
  activity: ResponsibilityActivity,
  current: FacilityRef | null,
  noneLabel: string,
): SelectItems {
  const fits = (s: AvailableStructure) => activity === 'manufacturing' || hostsReactions(s.groupId);
  const list = (structures ?? []).filter((s) => fits(s) || s.id === current?.id);
  const items: SelectItems = [{ value: '', label: noneLabel }, ...structureOptionGroups(list)];
  if (current === null || list.some((s) => s.id === current.id)) return items;
  return [...items, { value: facilityValueFor(current, null), label: `${current.name} (unavailable)` }];
}

/**
 * A facility choice from the account's saved custom structures and shared
 * corporation structures, the same list the planner uses. Reactions only
 * offer structures that can run them.
 */
export function FacilityPicker({
  label,
  value,
  structures,
  activity,
  noneLabel,
  onChange,
}: {
  label: string;
  value: FacilityRef | null;
  structures: readonly AvailableStructure[] | null;
  activity: ResponsibilityActivity;
  noneLabel: string;
  onChange: (next: FacilityRef | null) => void;
}) {
  return (
    <Select
      ariaLabel={label}
      value={facilityValueFor(value, null)}
      disabled={structures === null}
      items={facilityItems(structures, activity, value, noneLabel)}
      onValueChange={(raw) => {
        const next = facilityForValue(raw, value, structures);
        if (next !== undefined) onChange(next);
      }}
    />
  );
}
