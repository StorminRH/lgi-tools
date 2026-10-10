'use client';

import type { ReactNode } from 'react';
import * as Combobox from '@/components/ui/combobox';
import { pickOrType } from '@/components/ui/combobox-pick';
import { SearchIcon } from '@/components/ui/icons';

export interface PickOption<T> {
  key: string;
  label: ReactNode;
  meta?: ReactNode;
  item: T;
}

/**
 * A free-text field whose suggestions, when picked, hand back the item behind
 * them. A wrapping Field hands it the `id` its label points at.
 */
export function PickField<T>({
  id,
  value,
  onValueChange,
  options,
  onPick,
  trailing,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: PickOption<T>[];
  onPick: (item: T) => void;
  trailing?: ReactNode;
}) {
  // Items are the option keys, since names can collide. A pick goes to onPick, so a key never reaches the field.
  const byKey = new Map(options.map((o) => [o.key, o]));
  return (
    <Combobox.Root
      items={[...byKey.keys()]}
      value={value}
      onValueChange={(next, details) =>
        pickOrType(next, details, {
          lookup: (key) => byKey.get(key),
          onType: onValueChange,
          onPick: (option) => onPick(option.item),
        })
      }
      filter={null}
    >
      <Combobox.Field
        id={id}
        type="text"
        prompt={<SearchIcon size={15} />}
        trailing={trailing}
      />
      {options.length > 0 && (
        <Combobox.Panel className="max-h-[280px] w-[var(--anchor-width)] overflow-y-auto" sideOffset={6}>
          <Combobox.List>
            {options.map((o) => (
              <Combobox.Item
                key={o.key}
                value={o.key}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2"
              >
                <span className="font-ui text-ui text-name">{o.label}</span>
                {o.meta ? <span className="font-data text-micro text-muted">{o.meta}</span> : null}
              </Combobox.Item>
            ))}
          </Combobox.List>
        </Combobox.Panel>
      )}
    </Combobox.Root>
  );
}
