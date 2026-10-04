'use client';

import type { ReactNode } from 'react';
import * as Combobox from '@/components/ui/combobox';
import { SearchIcon } from '@/components/ui/icons';

export interface PickOption<T> {
  key: string;
  value: string;
  label: ReactNode;
  meta?: ReactNode;
  item: T;
}

/** A free-text field whose suggestions, when picked, hand back the item behind them. */
export function PickField<T>({
  id,
  value,
  onValueChange,
  options,
  onPick,
  trailing,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  options: PickOption<T>[];
  onPick: (item: T) => void;
  trailing?: ReactNode;
}) {
  return (
    <Combobox.Root
      items={options.map((o) => o.value)}
      value={value}
      onValueChange={(next: string) => onValueChange(next)}
      filter={null}
      mode="list"
    >
      <Combobox.Field
        id={id}
        type="text"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        prompt={<SearchIcon size={15} />}
        trailing={trailing}
      />
      {options.length > 0 && (
        <Combobox.Panel className="max-h-[280px] w-[var(--anchor-width)] overflow-y-auto" sideOffset={6}>
          <Combobox.List>
            {options.map((o) => (
              <Combobox.Item
                key={o.key}
                value={o.value}
                onClick={() => onPick(o.item)}
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
