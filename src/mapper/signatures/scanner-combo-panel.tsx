'use client';

import type { KeyboardEvent } from 'react';
import * as Combobox from '@/components/ui/combobox';
import { scrollArea } from '@/components/ui/scroll-area';

export interface ScannerComboGroup {
  readonly label: string;
  readonly items: readonly {
    readonly value: string;
    readonly text: string;
    readonly meta: string;
  }[];
}

export function consumeScannerEnter(event: KeyboardEvent<HTMLElement>): boolean {
  if (event.key !== 'Enter') return false;
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
  return true;
}

export function ScannerComboPanel({
  groups,
  itemValues,
  showLabels,
  footer,
}: {
  readonly groups: readonly ScannerComboGroup[];
  readonly itemValues: readonly string[];
  readonly showLabels: boolean;
  readonly footer: string | null;
}) {
  return (
    <Combobox.Panel
      className={`${scrollArea} min-w-44 max-h-[min(24rem,var(--available-height,24rem))] overflow-y-auto shadow-dd`}
      align="start"
    >
      {itemValues.length === 0 ? (
        <p className="px-2.5 py-2 font-ui text-label text-muted">No match</p>
      ) : null}
      <Combobox.List>
        {groups.map((group) =>
          group.items.length === 0 ? null : (
            <Combobox.Group
              key={group.label}
              items={group.items.map((item) => item.value)}
            >
              {showLabels ? (
                <Combobox.GroupLabel>{group.label}</Combobox.GroupLabel>
              ) : null}
              {group.items.map((item) => (
                <Combobox.Item
                  key={item.value}
                  value={item.value}
                  className="flex justify-between gap-3 px-2.5 py-1.5 font-ui text-ui text-isk"
                >
                  {item.text}
                  {item.meta !== '' ? (
                    <span className="text-muted">{item.meta}</span>
                  ) : null}
                </Combobox.Item>
              ))}
            </Combobox.Group>
          ),
        )}
      </Combobox.List>
      {footer !== null ? (
        <p className="px-2.5 pb-1.5 pt-1 font-ui text-label text-muted">
          {footer}
        </p>
      ) : null}
    </Combobox.Panel>
  );
}
