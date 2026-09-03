'use client';

import { Select, type SelectOption } from '@/components/ui/select';

export function RigSupply({
  validRigs,
  maxSlots,
  slots,
  onSlotsChange,
  disabled = false,
}: {

  validRigs: { typeId: number; name: string }[];
  maxSlots: number;

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
