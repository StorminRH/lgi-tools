'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { SIG_GROUPS, type SigGroup } from '@/data/maps/scan-parse';
import {
  useWormholeTypeSearch,
  type wormholeTypeSearch,
} from '../authoring/wormhole-type-search';
import { ScannerCombo, type ScannerComboGroup } from './scanner-combo-panel';
import { scannerSelectedFieldClass } from './scanner-field-class';
import { scannerGroupTypeLabel } from './signature-model';
import {
  scannerTypeSuggestionGroups,
  wormholeComboItems,
} from './scanner-type-combo';

const IDENTIFY_PREFIX = 'group:';
const TYPE_PREFIX = 'type:';

export function scannerIdentifySuggestionGroups(
  query: string,
  codes: readonly string[],
  preferredCodes: readonly string[],
  classLabelOf: (code: string) => string | null,
): readonly ScannerComboGroup[] {
  const typeGroups = scannerTypeSuggestionGroups(query, codes, preferredCodes);
  const needle = query.trim().toLowerCase();
  const identifyItems = SIG_GROUPS.filter((group) => {
    if (needle.length === 0) return true;
    const label = (scannerGroupTypeLabel(group) ?? group).toLowerCase();
    return label.startsWith(needle) || group.toLowerCase().startsWith(needle);
  }).map((group) => ({
    value: `${IDENTIFY_PREFIX}${group}`,
    text: scannerGroupTypeLabel(group) ?? group,
    meta: '',
  }));
  const holeGroups = typeGroups
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      label: group.label,
      items: wormholeComboItems(group.items, classLabelOf, TYPE_PREFIX),
    }));
  if (needle.length === 0) {
    return [
      ...holeGroups,
      { label: 'Identify', items: identifyItems },
    ];
  }
  return [
    ...holeGroups,
    ...(identifyItems.length > 0
      ? [{ label: 'Identify', items: identifyItems }]
      : []),
  ];
}

export function commitScannerIdentifyQuery(
  text: string,
  parse: ReturnType<typeof wormholeTypeSearch>['parse'],
  onIdentify: (group: SigGroup, wormholeTypeCode?: string) => void,
): void {
  const parsed = parse(text);
  if (parsed.ok && parsed.params.code !== null) {
    onIdentify('Wormhole', parsed.params.code);
    return;
  }
  const needle = text.trim().toLowerCase();
  if (needle.length === 0) return;
  const group = SIG_GROUPS.find((entry) => {
    const label = (scannerGroupTypeLabel(entry) ?? entry).toLowerCase();
    return label === needle || entry.toLowerCase() === needle;
  });
  if (group !== undefined) onIdentify(group);
}

export function ScannerIdentifyCombo({
  codes,
  preferredCodes,
  classLabelOf,
  rowId,
  onIdentify,
}: {
  readonly codes: readonly string[];
  readonly preferredCodes: readonly string[];
  readonly classLabelOf: (code: string) => string | null;
  readonly rowId: string;
  readonly onIdentify: (group: SigGroup, wormholeTypeCode?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const groups = useMemo(
    () => scannerIdentifySuggestionGroups(query, codes, preferredCodes, classLabelOf),
    [query, codes, preferredCodes, classLabelOf],
  );
  const search = useWormholeTypeSearch(codes, preferredCodes);
  const commitValue = (value: string) => {
    if (value.startsWith(IDENTIFY_PREFIX)) {
      onIdentify(value.slice(IDENTIFY_PREFIX.length) as SigGroup);
      return;
    }
    if (value.startsWith(TYPE_PREFIX)) {
      onIdentify('Wormhole', value.slice(TYPE_PREFIX.length));
    }
  };
  return (
    <ScannerCombo
      query={query}
      onQueryChange={setQuery}
      groups={groups}
      browsing={query.trim().length === 0}
      browseFooter="Type to search other holes…"
      ariaLabel={`Name ${rowId}`}
      fieldClassName={cn(scannerSelectedFieldClass(false), 'font-normal')}
      onCommitValue={commitValue}
      onCommitQuery={(text) =>
        commitScannerIdentifyQuery(text, search.parse, onIdentify)
      }
    />
  );
}
