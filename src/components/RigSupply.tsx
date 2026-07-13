'use client';

import { Select, type SelectOption } from '@/components/ui/select';

// Shared rig-slot control: N dropdowns, each picking a rig that fits the chosen
// structure. Lives in the `shared` zone (src/components/*.tsx) so BOTH the custom-
// structure builder (custom-structures slice) and the corp rig-completion editor
// (owned-structures slice) consume it without a banned feature→feature import. It is
// presentational over an opaque rig option list + controlled slot values; the parent
// owns the structure context (which rigs fit, how many slots) and the slot state. The
// builder's fit-paste box stays in the builder (it pre-fills the structure TYPE, a
// builder-only concern); the corp editor has a fixed structure and just supplies rigs.

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
  const rigOptions: SelectOption[] = validRigs.map((r) => ({ value: String(r.typeId), label: r.name }));
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label uppercase tracking-wide text-muted">
        Rigs ({validRigs.length} fit this structure)
      </span>
      <div className="flex flex-col gap-1.5">
        {slotIndices.map((i) => {
          const slot = slots[i];
          return (
            <Select
              key={i}
              value={slot == null ? '' : String(slot)}
              disabled={disabled}
              onValueChange={(v) => {
                const next = [...slots];
                next[i] = v === '' ? null : Number(v);
                onSlotsChange(next);
              }}
              items={[{ value: '', label: `— rig slot ${i + 1}: none —` }, ...rigOptions]}
              ariaLabel={`Rig slot ${i + 1}`}
              className="w-full max-w-[420px]"
            />
          );
        })}
      </div>
    </div>
  );
}
