'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import * as Combobox from '@/components/ui/combobox';
import { pickOrType } from '@/components/ui/combobox-pick';
import { scrollArea } from '@/components/ui/scroll-area';
import { useCloseOnScannerScroll } from './scanner-scroll-dismiss';

export interface ScannerComboGroup {
  readonly label: string;
  readonly items: readonly {
    readonly value: string;
    readonly text: string;
    readonly meta: string;
  }[];
}

function consumeScannerEnter(event: KeyboardEvent<HTMLElement>): boolean {
  if (event.key !== 'Enter') return false;
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
  return true;
}

function ScannerComboPanel({
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

/**
 * A scanner row's search field over grouped picks. The caller owns the typed
 * query, so a remount key at the call site still resets it. A pressed item
 * commits its value and never reaches the query; Enter commits the typed text.
 * Browsing shows the group labels and the footer. An `aside` (null included)
 * puts the field in a row with it; without one the field stands alone.
 */
export function ScannerCombo({
  query,
  onQueryChange,
  groups,
  browsing,
  browseFooter,
  ariaLabel,
  fieldClassName,
  onCommitValue,
  onCommitQuery,
  aside,
}: {
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly groups: readonly ScannerComboGroup[];
  readonly browsing: boolean;
  readonly browseFooter: string;
  readonly ariaLabel: string;
  readonly fieldClassName: string;
  readonly onCommitValue: (value: string) => void;
  readonly onCommitQuery: (query: string) => void;
  readonly aside?: ReactNode;
}) {
  const popup = useCloseOnScannerScroll();
  const items = groups.flatMap((group) => group.items.map((item) => item.value));
  const field = (
    <Combobox.Field
      size="sm"
      placeholder="Unresolved"
      aria-label={ariaLabel}
      className={fieldClassName}
      onKeyDown={(event) => {
        if (consumeScannerEnter(event)) onCommitQuery(query);
      }}
    />
  );
  return (
    <Combobox.Root
      open={popup.open}
      onOpenChange={popup.onOpenChange}
      value={query}
      onValueChange={(next, details) =>
        pickOrType(next, details, {
          onType: onQueryChange,
          onPick: onCommitValue,
        })
      }
      items={items}
      filter={null}
      openOnInputClick
    >
      {aside === undefined ? (
        field
      ) : (
        <div className="flex w-full min-w-0 max-w-full items-center gap-1">
          {field}
          {aside}
        </div>
      )}
      <ScannerComboPanel
        groups={groups}
        itemValues={items}
        showLabels={browsing}
        footer={browsing ? browseFooter : null}
      />
    </Combobox.Root>
  );
}
