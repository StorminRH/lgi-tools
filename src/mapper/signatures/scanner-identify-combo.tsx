'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/components/ui/cn';
import * as Combobox from '@/components/ui/combobox';
import { SIG_GROUPS, type SigGroup } from '@/data/maps/scan-parse';
import { FAR_SIDE_WORMHOLE_CODE } from '@/data/eve-data/wormhole-contract';
import { wormholeTypeSearch } from '../authoring/wormhole-type-search';
import {
  ScannerComboPanel,
  consumeScannerEnter,
  type ScannerComboGroup,
} from './scanner-combo-panel';
import { scannerSelectedFieldClass } from './scanner-field-class';
import { useCloseOnScannerScroll } from './scanner-scroll-dismiss';
import { scannerGroupTypeLabel } from './signature-model';
import { scannerTypeSuggestionGroups } from './scanner-type-combo';

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
      items: group.items.map((code) => ({
        value: `${TYPE_PREFIX}${code}`,
        text: code,
        meta: code === FAR_SIDE_WORMHOLE_CODE ? '' : (classLabelOf(code) ?? ''),
      })),
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
  disabled,
  onIdentify,
}: {
  readonly codes: readonly string[];
  readonly preferredCodes: readonly string[];
  readonly classLabelOf: (code: string) => string | null;
  readonly rowId: string;
  readonly disabled: boolean;
  readonly onIdentify: (group: SigGroup, wormholeTypeCode?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const groups = useMemo(
    () => scannerIdentifySuggestionGroups(query, codes, preferredCodes, classLabelOf),
    [query, codes, preferredCodes, classLabelOf],
  );
  const items = groups.flatMap((group) => group.items.map((item) => item.value));
  const search = useMemo(
    () => wormholeTypeSearch(codes, { preferredCodes, lenient: codes.length === 0 }),
    [codes, preferredCodes],
  );
  const commitValue = (value: string) => {
    if (value.startsWith(IDENTIFY_PREFIX)) {
      onIdentify(value.slice(IDENTIFY_PREFIX.length) as SigGroup);
      return;
    }
    if (value.startsWith(TYPE_PREFIX)) {
      onIdentify('Wormhole', value.slice(TYPE_PREFIX.length));
    }
  };
  const popup = useCloseOnScannerScroll();
  const browsing = query.trim().length === 0;
  return (
    <Combobox.Root
      open={popup.open}
      onOpenChange={popup.onOpenChange}
      value={query}
      onValueChange={(next, details) => {
        if (details.reason === 'item-press') {
          commitValue(next);
          return;
        }
        setQuery(next);
      }}
      items={items}
      filter={null}
      openOnInputClick
    >
      <Combobox.Field
        size="sm"
        placeholder="Unresolved"
        disabled={disabled}
        aria-label={`Name ${rowId}`}
        className={cn(scannerSelectedFieldClass(false), 'font-normal')}
        onKeyDown={(event) => {
          if (!consumeScannerEnter(event)) return;
          commitScannerIdentifyQuery(query, search.parse, onIdentify);
        }}
      />
      <ScannerComboPanel
        groups={groups}
        itemValues={items}
        showLabels={browsing}
        footer={browsing ? 'Type to search other holes…' : null}
      />
    </Combobox.Root>

  );
}
