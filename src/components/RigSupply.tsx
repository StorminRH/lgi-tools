'use client';

import { cn } from '@/components/ui/cn';

// Shared rig-slot control: N dropdowns, each picking a rig that fits the chosen
// structure. Lives in the `shared` zone (src/components/*.tsx) so BOTH the custom-
// structure builder (custom-structures slice) and the corp rig-completion editor
// (owned-structures slice) consume it without a banned feature→feature import. It is
// presentational over an opaque rig option list + controlled slot values; the parent
// owns the structure context (which rigs fit, how many slots) and the slot state. The
// builder's fit-paste box stays in the builder (it pre-fills the structure TYPE, a
// builder-only concern); the corp editor has a fixed structure and just supplies rigs.

const inputClass =
  'border border-border bg-bg px-2 py-1 font-mono text-[12px] text-text focus:border-border-active focus:outline-none';

export function RigSupply({
  validRigs,
  maxSlots,
  slots,
  onSlotsChange,
  disabled = false,
}: {
  // The rigs that fit the chosen structure (the parent applies the fit predicate).
  validRigs: { typeId: number; name: string }[];
  maxSlots: number;
  // Current rig-slot values, length === maxSlots; a slot is a rig typeId or null.
  slots: (number | null)[];
  onSlotsChange: (next: (number | null)[]) => void;
  disabled?: boolean;
}) {
  const slotIndices = Array.from({ length: maxSlots }, (_, i) => i);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.12em] text-muted">
        Rigs ({validRigs.length} fit this structure)
      </span>
      <div className="flex flex-col gap-1.5">
        {slotIndices.map((i) => (
          <select
            key={i}
            value={slots[i] ?? ''}
            disabled={disabled}
            onChange={(e) => {
              const next = [...slots];
              next[i] = e.target.value === '' ? null : Number(e.target.value);
              onSlotsChange(next);
            }}
            aria-label={`Rig slot ${i + 1}`}
            className={cn(inputClass, 'w-full max-w-[420px]')}
          >
            <option value="">— rig slot {i + 1}: none —</option>
            {validRigs.map((r) => (
              <option key={r.typeId} value={r.typeId}>
                {r.name}
              </option>
            ))}
          </select>
        ))}
      </div>
    </div>
  );
}
