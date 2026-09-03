'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/components/ui/cn';
import * as Combobox from '@/components/ui/combobox';
import { FAR_SIDE_WORMHOLE_CODE } from '@/data/eve-data/wormhole-contract';
import { wormholeTypeSearch } from '../authoring/wormhole-type-search';
import {
  ScannerComboPanel,
  consumeScannerEnter,
  type ScannerComboGroup,
} from './scanner-combo-panel';
import { scannerSelectedFieldClass } from './scanner-field-class';
import { useCloseOnScannerScroll } from './scanner-scroll-dismiss';

export interface ScannerTypeSuggestionGroup {
  readonly label: string;
  readonly items: readonly string[];
}

export function scannerTypeSuggestionGroups(
  query: string,
  codes: readonly string[],
  preferredCodes: readonly string[],
): readonly ScannerTypeSuggestionGroup[] {
  const known = new Set(codes.map((code) => code.toUpperCase()));
  const preferred = [
    ...new Set(preferredCodes.map((code) => code.toUpperCase())),
  ].filter((code) => known.has(code));
  const needle = query.trim().toUpperCase();
  if (needle.length === 0) {
    return [
      { label: 'Statics', items: preferred },
      { label: 'Inbound', items: [FAR_SIDE_WORMHOLE_CODE] },
    ];
  }
  const matches = codes
    .map((code) => code.toUpperCase())
    .filter((code) => code.startsWith(needle))
    .toSorted((left, right) => {
      const leftPref = preferred.includes(left) ? 0 : 1;
      const rightPref = preferred.includes(right) ? 0 : 1;
      return leftPref - rightPref || left.localeCompare(right);
    })
    .slice(0, 12);
  if (
    FAR_SIDE_WORMHOLE_CODE.startsWith(needle) &&
    !matches.includes(FAR_SIDE_WORMHOLE_CODE)
  ) {
    matches.unshift(FAR_SIDE_WORMHOLE_CODE);
  }
  return [{ label: 'Matches', items: matches }];
}

function typeGroupsAsComboItems(
  groups: readonly ScannerTypeSuggestionGroup[],
  classLabelOf: (code: string) => string | null,
): readonly ScannerComboGroup[] {
  return groups.map((group) => ({
    label: group.label,
    items: group.items.map((code) => ({
      value: code,
      text: code,
      meta: code === FAR_SIDE_WORMHOLE_CODE ? '' : (classLabelOf(code) ?? ''),
    })),
  }));
}

export function ScannerTypeCombo({
  code,
  className,
  codes,
  preferredCodes,
  classLabelOf,
  rowId,
  disabled,
  onCommit,
}: {
  readonly code: string | null;
  readonly className: string | null;
  readonly codes: readonly string[];
  readonly preferredCodes: readonly string[];
  readonly classLabelOf: (code: string) => string | null;
  readonly rowId: string;
  readonly disabled: boolean;
  readonly onCommit: (value: string | null) => void;
}) {
  const [query, setQuery] = useState(code ?? '');
  const groups = useMemo(
    () => scannerTypeSuggestionGroups(query, codes, preferredCodes),
    [query, codes, preferredCodes],
  );
  const items = groups.flatMap((group) => [...group.items]);
  const search = useMemo(
    () => wormholeTypeSearch(codes, { preferredCodes, lenient: codes.length === 0 }),
    [codes, preferredCodes],
  );
  const popup = useCloseOnScannerScroll();
  const browsing = query.trim().length === 0;
  const panelGroups = typeGroupsAsComboItems(groups, classLabelOf);
  return (
    <Combobox.Root
      open={popup.open}
      onOpenChange={popup.onOpenChange}
      value={query}
      onValueChange={(next, details) => {
        if (details.reason === 'item-press') {
          const parsed = search.parse(next);
          if (parsed.ok) onCommit(parsed.params.code);
          return;
        }
        setQuery(next);
      }}
      items={items}
      filter={null}
      openOnInputClick
    >
      <div className="flex w-full min-w-0 max-w-full items-center gap-1">
        <Combobox.Field
          size="sm"
          placeholder="Unresolved"
          disabled={disabled}
          aria-label={`Type ${rowId}`}
          className={cn(
            scannerSelectedFieldClass(code !== null),
            code === null && 'font-normal',
          )}
          onKeyDown={(event) => {
            if (!consumeScannerEnter(event)) return;
            const parsed = search.parse(query);
            if (parsed.ok) onCommit(parsed.params.code);
          }}
        />
        {code !== null && className !== null && query === code ? (
          <span
            data-signature-class
            className="shrink-0 font-ui text-micro uppercase tracking-label text-muted"
          >
            {className}
          </span>

        ) : null}
      </div>

      <ScannerComboPanel
        groups={panelGroups}
        itemValues={items}
        showLabels={browsing}
        footer={browsing ? 'Type to search other holes…' : null}
      />
    </Combobox.Root>

  );
}
