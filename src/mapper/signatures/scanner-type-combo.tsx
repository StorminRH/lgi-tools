'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { FAR_SIDE_WORMHOLE_CODE } from '@/data/eve-data/wormhole-contract';
import { useWormholeTypeSearch } from '../authoring/wormhole-type-search';
import { ScannerCombo, type ScannerComboGroup } from './scanner-combo-panel';
import { scannerSelectedFieldClass } from './scanner-field-class';
import { SignatureClassChip } from './scanner-row-cells';

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

/**
 * Combo items for wormhole codes: the code as text and its class as meta,
 * except the far-side code, which has no class of its own.
 */
export function wormholeComboItems(
  codes: readonly string[],
  classLabelOf: (code: string) => string | null,
  valuePrefix = '',
): ScannerComboGroup['items'] {
  return codes.map((code) => ({
    value: `${valuePrefix}${code}`,
    text: code,
    meta: code === FAR_SIDE_WORMHOLE_CODE ? '' : (classLabelOf(code) ?? ''),
  }));
}

export function ScannerTypeCombo({
  code,
  className,
  codes,
  preferredCodes,
  classLabelOf,
  rowId,
  onCommit,
}: {
  readonly code: string | null;
  readonly className: string | null;
  readonly codes: readonly string[];
  readonly preferredCodes: readonly string[];
  readonly classLabelOf: (code: string) => string | null;
  readonly rowId: string;
  readonly onCommit: (value: string | null) => void;
}) {
  const [query, setQuery] = useState(code ?? '');
  const groups = useMemo(
    () =>
      scannerTypeSuggestionGroups(query, codes, preferredCodes).map((group) => ({
        label: group.label,
        items: wormholeComboItems(group.items, classLabelOf),
      })),
    [query, codes, preferredCodes, classLabelOf],
  );
  const search = useWormholeTypeSearch(codes, preferredCodes);
  // A pressed or entered code that does not parse commits nothing.
  const commit = (text: string) => {
    const parsed = search.parse(text);
    if (parsed.ok) onCommit(parsed.params.code);
  };
  return (
    <ScannerCombo
      query={query}
      onQueryChange={setQuery}
      groups={groups}
      browsing={query.trim().length === 0}
      browseFooter="Type to search other holes…"
      ariaLabel={`Type ${rowId}`}
      fieldClassName={cn(
        scannerSelectedFieldClass(code !== null),
        code === null && 'font-normal',
      )}
      onCommitValue={commit}
      onCommitQuery={commit}
      aside={
        className !== null && query === code ? (
          <SignatureClassChip label={className} />
        ) : null
      }
    />
  );
}
