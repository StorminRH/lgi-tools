'use client';

import Link from 'next/link';
import { Pill } from '@/components/ui/pill';
import type { StructureBonus } from '../structure-bonus';
import type { AvailableStructure, StructureBonusRole } from '../types';
import { usePricing } from './PricingProvider';

// The source-agnostic build-structure selector (3.7.9.1.3): one Engineering-
// Complex slot (drives manufacturing nodes) + one Refinery slot (drives reaction
// nodes), over the structures the user can place this build in. Reads everything
// from the pricing store; selecting a structure applies its bonus live. The corp-
// pulled source (3.7.9.1.4) plugs into the same list with no change here.

// A reduction percent for the readout — small values keep a decimal.
function pct(n: number): string {
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;
}

function BonusReadout({ bonus, role }: { bonus: StructureBonus; role: StructureBonusRole }) {
  const parts: string[] = [];
  if (role === 'manufacturing') {
    if (bonus.me > 0) parts.push(`ME −${pct(bonus.me)}`);
    if (bonus.te > 0) parts.push(`TE −${pct(bonus.te)}`);
    if (bonus.costBonus > 0) parts.push(`Cost −${pct(bonus.costBonus)}`);
  } else if (bonus.te > 0) {
    parts.push(`TE −${pct(bonus.te)}`);
  }
  if (parts.length === 0) return null;
  return <Pill tone="green">{parts.join(' · ')}</Pill>;
}

function RoleSlot({
  label,
  role,
  structures,
  selectedId,
  onSelect,
  bonus,
}: {
  label: string;
  role: StructureBonusRole;
  structures: AvailableStructure[];
  selectedId: string | null;
  onSelect: (structure: AvailableStructure | null) => void;
  bonus: StructureBonus | null;
}) {
  if (structures.length === 0) return null;
  // Selected but no live bonus ⇒ a custom structure with no build system picked yet.
  const needsSystem = selectedId !== null && bonus === null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="w-[96px] text-[10px] uppercase tracking-[0.12em] text-muted">{label}</label>
      <select
        value={selectedId ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onSelect(v === '' ? null : (structures.find((s) => s.id === v) ?? null));
        }}
        aria-label={`${label} structure`}
        className="min-w-[180px] border border-border bg-bg px-2 py-1 font-mono text-[11px] text-text focus:border-border-active focus:outline-none"
      >
        <option value="">— none —</option>
        {structures.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {bonus && <BonusReadout bonus={bonus} role={role} />}
      {needsSystem && (
        <span className="text-[10px] text-muted">pick a build system to apply</span>
      )}
    </div>
  );
}

export function StructureSelector() {
  const { availableStructures, selectedStructures, setSelectedStructure, structureFactors } =
    usePricing();

  // Still loading the per-user list — render nothing rather than flash an empty state.
  if (availableStructures === null) return null;

  if (availableStructures.length === 0) {
    return (
      <div className="text-[11px] text-muted">
        No structures yet —{' '}
        <Link href="/structures" className="text-text underline hover:text-border-active">
          build one
        </Link>
        .
      </div>
    );
  }

  const manufacturing = availableStructures.filter((s) => s.role === 'manufacturing');
  const reaction = availableStructures.filter((s) => s.role === 'reaction');

  return (
    <div className="flex flex-col gap-1.5">
      <RoleSlot
        label="Manufacturing"
        role="manufacturing"
        structures={manufacturing}
        selectedId={selectedStructures.manufacturing?.id ?? null}
        onSelect={(s) => setSelectedStructure('manufacturing', s)}
        bonus={structureFactors.manufacturingBonus}
      />
      <RoleSlot
        label="Reaction"
        role="reaction"
        structures={reaction}
        selectedId={selectedStructures.reaction?.id ?? null}
        onSelect={(s) => setSelectedStructure('reaction', s)}
        bonus={structureFactors.reactionBonus}
      />
      <Link
        href="/structures"
        className="self-start text-[10px] uppercase tracking-[0.12em] text-muted hover:text-text"
      >
        Manage structures →
      </Link>
    </div>
  );
}
