'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/components/ui/cn';
import * as Combobox from '@/components/ui/combobox';
import { useSystemSearch } from '@/components/use-system-search';
import {
  formatSec,
  type SystemSearchEntry,
} from '@/data/eve-data/systems-search';
import {
  WORMHOLE_DESTINATION_HINTS,
  type WormholeDestinationHint,
} from '@/data/eve-data/wormhole-contract';
import type { SystemIdentityReadout } from '@/data/eve-data/system-identity';
import { UNSET_FIELD } from '../authoring/connection-field-group';
import {
  parseDestinationSystem,
  type ConnectionFieldSetters,
  type OriginLeadOption,
} from '../authoring/connection-fields';
import {
  decodeOriginLead,
  encodeOriginLead,
  originLeadForSystem,
  originLeadForTypedLabel,
} from '../authoring/leads-to-origin';
import {
  ScannerComboPanel,
  consumeScannerEnter,
  type ScannerComboGroup,
} from './scanner-combo-panel';
import { scannerSelectedFieldClass } from './scanner-field-class';
import { useCloseOnScannerScroll } from './scanner-scroll-dismiss';

const HINT_PREFIX = 'hint:';
const SYSTEM_PREFIX = 'system:';

const HINT_LABELS: Record<WormholeDestinationHint, string> = {
  hisec: 'High-sec',
  lowsec: 'Low-sec',
  nullsec: 'Null-sec',
  unknown: 'Unknown (C1–C3)',
  dangerous: 'Dangerous (C4–C5)',
  deadly: 'Deadly (C6)',
  thera: 'Thera',
  pochven: 'Pochven',
  drifter: 'Drifter',
};

export function scannerLeadsSeed(
  hint: WormholeDestinationHint | null,
  destination: SystemIdentityReadout | null,
): string {
  if (destination !== null) return destination.label;
  return hint === null ? '' : HINT_LABELS[hint];
}

export function scannerLeadsSuggestionGroups(
  query: string,
  systems: readonly SystemSearchEntry[],
  seed: string,
  originLeads: readonly OriginLeadOption[] = [],
  originSystemId?: number,
): readonly ScannerComboGroup[] {
  const needle = query.trim().toLowerCase();
  const browsing = needle.length === 0 || query === seed;
  const originItems = originLeads
    .filter((option) => {
      if (browsing) return true;
      return option.label.toLowerCase().includes(needle);
    })
    .map((option) => ({
      value: encodeOriginLead(option.connectionId),
      text: option.label,
      meta: '',
    }));
  const hintItems = WORMHOLE_DESTINATION_HINTS.filter((value) => {
    if (browsing) return true;
    return (
      HINT_LABELS[value].toLowerCase().includes(needle)
      || value.startsWith(needle)
    );
  }).map((value) => ({
    value: `${HINT_PREFIX}${value}`,
    text: HINT_LABELS[value],
    meta: '',
  }));
  const unsetItem = {
    value: UNSET_FIELD,
    text: 'Unset',
    meta: '',
  };
  const originGroup =
    originItems.length > 0
      ? [{ label: 'Origin', items: originItems }]
      : [];
  if (browsing) {
    return [...originGroup, { label: 'Class', items: [unsetItem, ...hintItems] }];
  }
  const systemItems = systems
    .filter((entry) => entry.id !== originSystemId)
    .filter((entry) => entry.name.toLowerCase().startsWith(needle))
    .slice(0, 12)
    .map((entry) => ({
      value: `${SYSTEM_PREFIX}${entry.id}`,
      text: entry.name,
      meta: entry.security === null ? '' : formatSec(entry.security),
    }));
  const showUnset = 'unset'.startsWith(needle);
  return [
    ...(hintItems.length > 0 || showUnset
      ? [{
          label: 'Class',
          items: showUnset ? [unsetItem, ...hintItems] : hintItems,
        }]
      : []),
    ...originGroup,
    ...(systemItems.length > 0
      ? [{ label: 'Systems', items: systemItems }]
      : []),
  ];
}

export type ScannerLeadsCommit = Pick<
  ConnectionFieldSetters,
  'setLeadsTo' | 'setDestination' | 'linkToOrigin'
> & {
  readonly originSystemId?: number;
  readonly originLeads?: readonly OriginLeadOption[];
};

export function commitScannerLeadsValue(
  value: string,
  commit: ScannerLeadsCommit,
): void {
  const originLeads = commit.originLeads ?? [];
  const originId = decodeOriginLead(value);
  if (originId !== null) {
    commit.linkToOrigin(originId);
    return;
  }
  if (value === UNSET_FIELD) {
    commit.setDestination(null);
    return;
  }
  if (value.startsWith(HINT_PREFIX)) {
    commit.setLeadsTo(value.slice(HINT_PREFIX.length) as WormholeDestinationHint);
    return;
  }
  if (value.startsWith(SYSTEM_PREFIX)) {
    const systemId = Number(value.slice(SYSTEM_PREFIX.length));
    if (
      Number.isSafeInteger(systemId)
      && systemId > 0
      && systemId !== commit.originSystemId
    ) {
      const leadId = originLeadForSystem(systemId, originLeads);
      if (leadId !== null) {
        commit.linkToOrigin(leadId);
        return;
      }
      commit.setDestination(systemId);
    }
  }
}

export function commitScannerLeadsQuery(
  text: string,
  parse: (input: string) =>
    | { ok: true; params: { system: { id: number } } }
    | { ok: false },
  commit: ScannerLeadsCommit,
): void {
  const originLeads = commit.originLeads ?? [];
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    commitScannerLeadsValue(UNSET_FIELD, commit);
    return;
  }
  const originId = originLeadForTypedLabel(trimmed, originLeads);
  if (originId !== null) {
    commitScannerLeadsValue(encodeOriginLead(originId), commit);
    return;
  }
  const hintMatch = WORMHOLE_DESTINATION_HINTS.find((value) => {
    return (
      HINT_LABELS[value].toLowerCase() === trimmed.toLowerCase()
      || value === trimmed.toLowerCase()
    );
  });
  if (hintMatch !== undefined) {
    commitScannerLeadsValue(`${HINT_PREFIX}${hintMatch}`, commit);
    return;
  }
  const parsed = parseDestinationSystem(parse, trimmed, commit.originSystemId);
  if (parsed.ok) {
    commitScannerLeadsValue(
      `${SYSTEM_PREFIX}${parsed.params.system.id}`,
      commit,
    );
  }
}

export function ScannerLeadsControl({
  hint,
  destination,
  originLeads,
  originSystemId,
  rowId,
  disabled,
  onChange,
  onSetDestination,
  onLinkOrigin,
}: {
  readonly hint: WormholeDestinationHint | null;
  readonly destination: SystemIdentityReadout | null;
  readonly originLeads: readonly OriginLeadOption[];
  readonly originSystemId: number;
  readonly rowId: string;
  readonly disabled: boolean;
  readonly onChange: ConnectionFieldSetters['setLeadsTo'];
  readonly onSetDestination: ConnectionFieldSetters['setDestination'];
  readonly onLinkOrigin: ConnectionFieldSetters['linkToOrigin'];
}) {
  const seed = scannerLeadsSeed(hint, destination);
  const [query, setQuery] = useState(seed);
  const { systems, parse } = useSystemSearch();
  const offeredLeads = useMemo(
    () => (destination === null ? originLeads : []),
    [destination, originLeads],
  );
  const groups = useMemo(
    () =>
      scannerLeadsSuggestionGroups(
        query,
        systems,
        seed,
        offeredLeads,
        originSystemId,
      ),
    [query, systems, seed, offeredLeads, originSystemId],
  );
  const items = groups.flatMap((group) => group.items.map((item) => item.value));
  const resolved = destination !== null || hint !== null;
  const popup = useCloseOnScannerScroll();
  const browsing = query.trim().length === 0 || query === seed;
  const setters = {
    setLeadsTo: onChange,
    setDestination: onSetDestination,
    linkToOrigin: onLinkOrigin,
    originSystemId,
    originLeads,
  };
  return (
    <Combobox.Root
      open={popup.open}
      onOpenChange={popup.onOpenChange}
      value={query}
      onValueChange={(next, details) => {
        if (details.reason === 'item-press') {
          commitScannerLeadsValue(next, setters);
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
        aria-label={`Destination ${rowId}`}
        className={cn(
          scannerSelectedFieldClass(resolved),
          resolved ? destination?.tone : 'font-normal',
        )}
        onKeyDown={(event) => {
          if (!consumeScannerEnter(event)) return;
          commitScannerLeadsQuery(query, parse, setters);
        }}
      />
      <ScannerComboPanel
        groups={groups}
        itemValues={items}
        showLabels={browsing}
        footer={browsing ? 'Type to search systems…' : null}
      />
    </Combobox.Root>

  );
}

export function scannerLeadsReadout(
  hint: WormholeDestinationHint | null,
  destination: SystemIdentityReadout | null,
): string {
  if (destination !== null) return destination.label;
  return hint === null ? 'Unset' : HINT_LABELS[hint];
}
