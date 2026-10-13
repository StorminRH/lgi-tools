'use client';

import { Select, type SelectOption } from '@/components/ui/select';
import { UPWELL_RIG_SLOTS } from '@/data/eve-data/structures';

export function RigSupply({
  validRigs,
  slots,
  onSlotsChange,
  disabled = false,
}: {
  validRigs: { typeId: number; name: string }[];
  slots: (number | null)[];
  onSlotsChange: (next: (number | null)[]) => void;
  disabled?: boolean;
}) {
  const slotIndices = Array.from({ length: UPWELL_RIG_SLOTS }, (_, i) => i);
  const rigOptions: SelectOption[] = validRigs.map((r) => ({ value: String(r.typeId), label: r.name }));
  return (
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
            items={[{ value: '', label: '—' }, ...rigOptions]}
            ariaLabel={`Rig slot ${i + 1}`}
            className="w-full"
          />
        );
      })}
    </div>
  );
}
