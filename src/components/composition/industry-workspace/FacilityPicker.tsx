'use client';

import Link from 'next/link';
import { Select, type SelectItems } from '@/components/ui/select';
import { structureOptionGroups } from '@/features/industry-planner/components/structure-options';
import { facilityValueFor, parseFacilityValue } from '@/features/industry-planner/facility-value';
import { formatBonusPct } from '@/features/industry-planner/structure-bonus-view';
import { hostsReactions } from '@/features/industry-planner/structure-factors';
import type { AvailableStructure } from '@/features/industry-planner/types';
import type { FacilityRef } from '@/features/industry-planner/profiles/profile-document';
import type { StructureBonus } from '@/features/industry-planner/structure-bonus';
import { type FacilityEffects, type ResponsibilityActivity } from './workspace-model';

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
        const selection = parseFacilityValue(raw);
        if (selection.kind !== 'structure') return onChange(null);
        if (selection.id === value?.id) return;
        const structure = structures?.find((s) => s.id === selection.id);
        if (structure !== undefined) onChange({ id: structure.id, name: structure.name });
      }}
    />
  );
}

export function ManageStructuresLink() {
  return (
    <Link href="/structures" className="text-micro text-isk no-underline transition-colors hover:text-name">
      Manage structures →
    </Link>
  );
}

function pct(n: number): string {
  return n > 0 ? `−${formatBonusPct(n)}` : '—';
}

function BonusCells({ bonus, activity }: { bonus: StructureBonus; activity: ResponsibilityActivity }) {
  if (activity === 'reactions') return <span>time {pct(bonus.te)}</span>;
  return (
    <span>
      material {pct(bonus.me)} · time {pct(bonus.te)} · job cost {pct(bonus.costBonus)}
    </span>
  );
}

function RigLine({ effects, activity }: { effects: FacilityEffects; activity: ResponsibilityActivity }) {
  const { rigs } = effects;
  if (rigs.kind === 'none') return <span className="text-faint">No rigs</span>;
  if (rigs.kind === 'needs-security') {
    return <span className="text-faint">Depends on the system&apos;s security. Pin the structure to a system to see it.</span>;
  }
  return <BonusCells bonus={rigs.bonus} activity={activity} />;
}

/**
 * What the facility itself contributes, kept apart from any character: the
 * hull, the rigs at the structure's security, and the owner's tax.
 */
export function FacilityEffectsReadout({
  effects,
  activity,
}: {
  effects: FacilityEffects;
  activity: ResponsibilityActivity;
}) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-data text-micro text-muted">
      {!effects.suitsActivity ? (
        <dd className="col-span-2 text-dps-mid">This structure cannot run reactions.</dd>
      ) : null}
      <dt className="text-faint">Hull</dt>
      <dd>
        <BonusCells bonus={effects.hull} activity={activity} />
      </dd>
      <dt className="text-faint">Rigs{effects.security !== null ? ` (${effects.security}-sec)` : ''}</dt>
      <dd>
        <RigLine effects={effects} activity={activity} />
      </dd>
      <dt className="text-faint">Tax</dt>
      <dd>{effects.taxPct === null ? <span className="text-faint">Not set</span> : `${effects.taxPct}%`}</dd>
      {activity === 'reactions' ? (
        <dd className="col-span-2 text-faint">Reaction material bonuses from rigs are not modelled yet.</dd>
      ) : null}
    </dl>
  );
}
