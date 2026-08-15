'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import { cn } from '@/components/ui/cn';
import * as Combobox from '@/components/ui/combobox';
import { scrollArea } from '@/components/ui/scroll-area';
import { Select } from '@/components/ui/select';
import { useSystemSearch } from '@/components/use-system-search';
import { SIG_GROUPS, type SigGroup } from '@/data/maps/scan-parse';
import {
  formatSec,
  type SystemSearchEntry,
} from '@/data/eve-data/systems-search';
import { FAR_SIDE_WORMHOLE_CODE } from '@/data/eve-data/wormhole-contract';
import {
  CONNECTION_MASS_STATES,
  WORMHOLE_DESTINATION_HINTS,
  WORMHOLE_LIFE_STAGES,
  type ConnectionMassState,
  type WormholeDestinationHint,
  type WormholeLifeStage,
} from '@/data/eve-data/wormhole-contract';
import type { SystemIdentityReadout } from '@/data/eve-data/system-identity';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import {
  decodeOptionalField,
  encodeOptionalField,
  UNSET_FIELD,
} from '../authoring/connection-field-group';
import type {
  ConnectionFieldSetters,
  OriginLeadOption,
} from '../authoring/connection-fields';
import { decodeOriginLead, encodeOriginLead } from '../authoring/leads-to-origin';
import { wormholeTypeSearch } from '../authoring/wormhole-type-search';
import type { ConnectionEditorDetail } from '../chain/use-map-chain';
import { useCloseOnScannerScroll } from './scanner-scroll-dismiss';
import { scannerGroupTypeLabel, scannerLifeUpperBound } from './signature-model';

const MASS_SHORT: Record<ConnectionMassState, string> = {
  stable: '>50%',
  reduced: '<50%',
  critical: '<10%',
};

const MASS_LONG: Record<ConnectionMassState, string> = {
  stable: 'More than 50% remaining',
  reduced: 'Less than 50% remaining',
  critical: 'Less than 10% remaining',
};

const LIFE_SHORT: Record<WormholeLifeStage, string> = {
  under_1_day: '<1d',
  under_4_hours: '<4h',
  under_1_hour: '<1h',
  expired: 'Exp',
};

const LIFE_LONG: Record<WormholeLifeStage, string> = {
  under_1_day: 'Less than 1 day remaining',
  under_4_hours: 'Less than 4 hours remaining',
  under_1_hour: 'Less than 1 hour remaining',
  expired: 'Expired, closure imminent',
};

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

const CHIP =
  'h-7 w-full min-w-0 max-w-full overflow-hidden border-border-idle bg-bg px-1.5 text-ui shadow-none';

const COMBO_FIELD =
  'w-full min-w-0 max-w-full overflow-hidden border-transparent bg-transparent px-1 shadow-none ' +
  'data-[popup-open]:border-isk data-[popup-open]:bg-transparent data-[popup-open]:shadow-none';

function consumeScannerEnter(event: KeyboardEvent<HTMLElement>): boolean {
  if (event.key !== 'Enter') return false;
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
  return true;
}

const IDENTIFY_PREFIX = 'group:';
const TYPE_PREFIX = 'type:';
const HINT_PREFIX = 'hint:';
const SYSTEM_PREFIX = 'system:';

/** One labelled suggestion section for the unknown-row identify cell. */
export interface ScannerIdentifySuggestionGroup {
  readonly label: string;
  readonly items: readonly {
    readonly value: string;
    readonly text: string;
    readonly meta: string;
  }[];
}

/**
 * Empty query lists statics, K162, then identify groups. Typing filters
 * hole codes and identify labels together.
 */
export function scannerIdentifySuggestionGroups(
  query: string,
  codes: readonly string[],
  preferredCodes: readonly string[],
  classLabelOf: (code: string) => string | null,
): readonly ScannerIdentifySuggestionGroup[] {
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

/** One labelled suggestion section for the wormhole-type cell. */
export interface ScannerTypeSuggestionGroup {
  readonly label: string;
  readonly items: readonly string[];
}

/**
 * Empty query lists this system's statics, then K162. Typing prefix-filters
 * the remaining codex (statics still first).
 */
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

/** Compact wormhole-type combobox: statics + K162 on click, search on type. */
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

/** Compact unknown-row combobox: same panel as type, plus identify groups. */
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

function scannerSelectedFieldClass(selected: boolean): string {
  return selected
    ? cn(COMBO_FIELD, 'font-medium text-name')
    : CHIP;
}

/** Compact mass select using in-game wording in the list and short trigger text. */
export function ScannerMassSelect({
  value,
  rowId,
  disabled,
  onChange,
}: {
  readonly value: ConnectionEditorDetail['massState'];
  readonly rowId: string;
  readonly disabled: boolean;
  readonly onChange: ConnectionFieldSetters['setMassState'];
}) {
  const popup = useCloseOnScannerScroll();
  const selected = value !== null;
  return (
    <Select
      open={popup.open}
      onOpenChange={popup.onOpenChange}
      size="sm"
      ariaLabel={`Mass ${rowId}`}
      disabled={disabled}
      caret={!selected}
      className={scannerSelectedFieldClass(selected)}
      value={encodeOptionalField(value)}
      onValueChange={(next) =>
        onChange(decodeOptionalField(next) as ConnectionMassState | null)
      }
      items={[
        { value: UNSET_FIELD, label: '—' },
        ...CONNECTION_MASS_STATES.map((state) => ({
          value: state,
          label: MASS_LONG[state],
          triggerLabel: MASS_SHORT[state],
        })),
      ]}
    />
  );
}

/** Compact reliable-lifetime select. */
export function ScannerLifeSelect({
  value,
  connection,
  entry,
  now,
  rowId,
  disabled,
  onChange,
}: {
  readonly value: ConnectionEditorDetail['lifeStage'];
  readonly connection: ConnectionEditorDetail | null;
  readonly entry: WormholeCodexEntry | null;
  readonly now: number;
  readonly rowId: string;
  readonly disabled: boolean;
  readonly onChange: ConnectionFieldSetters['setLifeStage'];
}) {
  const popup = useCloseOnScannerScroll();
  const selected = value !== null;
  const upperBound = scannerLifeUpperBound(connection, entry, now);
  return (
    <Select
      open={popup.open}
      onOpenChange={popup.onOpenChange}
      size="sm"
      ariaLabel={`Reliable Lifetime ${rowId}`}
      disabled={disabled}
      caret={!selected}
      className={scannerSelectedFieldClass(selected)}
      value={encodeOptionalField(value)}
      onValueChange={(next) =>
        onChange(decodeOptionalField(next) as WormholeLifeStage | null)
      }
      items={[
        { value: UNSET_FIELD, label: '—' },
        ...WORMHOLE_LIFE_STAGES.map((stage) => ({
          value: stage,
          label: LIFE_LONG[stage],
          triggerLabel:
            stage === value && upperBound !== '—'
              ? upperBound
              : LIFE_SHORT[stage],
        })),
      ]}
    />
  );
}

/** One labelled suggestion section for the destination cell. */
export interface ScannerLeadsSuggestionGroup {
  readonly label: string;
  readonly items: readonly {
    readonly value: string;
    readonly text: string;
    readonly meta: string;
  }[];
}

/** Seed text for the destination field: settled label, else the class hint. */
export function scannerLeadsSeed(
  hint: WormholeDestinationHint | null,
  destination: SystemIdentityReadout | null,
): string {
  if (destination !== null) return destination.label;
  return hint === null ? '' : HINT_LABELS[hint];
}

/**
 * Empty or seed-equal query lists class hints. Typing filters hints and
 * system names together so a resolved hole can be retargeted in place.
 */
export function scannerLeadsSuggestionGroups(
  query: string,
  systems: readonly SystemSearchEntry[],
  seed: string,
  originLeads: readonly OriginLeadOption[] = [],
  originSystemId?: number,
): readonly ScannerLeadsSuggestionGroup[] {
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

/** Commits a destination combo value as a class hint, system, or unset. */
export function commitScannerLeadsValue(
  value: string,
  onChange: ConnectionFieldSetters['setLeadsTo'],
  onSetDestination: ConnectionFieldSetters['setDestination'],
  onLinkOrigin: ConnectionFieldSetters['linkToOrigin'],
  originSystemId?: number,
): void {
  const originId = decodeOriginLead(value);
  if (originId !== null) {
    onLinkOrigin(originId);
    return;
  }
  if (value === UNSET_FIELD) {
    onSetDestination(null);
    return;
  }
  if (value.startsWith(HINT_PREFIX)) {
    onChange(value.slice(HINT_PREFIX.length) as WormholeDestinationHint);
    return;
  }
  if (value.startsWith(SYSTEM_PREFIX)) {
    const systemId = Number(value.slice(SYSTEM_PREFIX.length));
    if (
      Number.isSafeInteger(systemId)
      && systemId > 0
      && systemId !== originSystemId
    ) {
      onSetDestination(systemId);
    }
  }
}

/** Commits typed identify-cell text as a wormhole type or a site group. */
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

/** Commits typed destination-cell text as unset, origin, hint, or system. */
export function commitScannerLeadsQuery(
  text: string,
  parse: (input: string) =>
    | { ok: true; params: { system: { id: number } } }
    | { ok: false },
  originLeads: readonly OriginLeadOption[],
  onChange: ConnectionFieldSetters['setLeadsTo'],
  onSetDestination: ConnectionFieldSetters['setDestination'],
  onLinkOrigin: ConnectionFieldSetters['linkToOrigin'],
  originSystemId?: number,
): void {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    commitScannerLeadsValue(
      UNSET_FIELD,
      onChange,
      onSetDestination,
      onLinkOrigin,
      originSystemId,
    );
    return;
  }
  const originMatch = originLeads.find((option) => {
    const label = option.label.toLowerCase();
    return (
      label === trimmed.toLowerCase()
      || label.startsWith(`${trimmed.toLowerCase()} - `)
    );
  });
  if (originMatch !== undefined) {
    commitScannerLeadsValue(
      encodeOriginLead(originMatch.connectionId),
      onChange,
      onSetDestination,
      onLinkOrigin,
      originSystemId,
    );
    return;
  }
  const hintMatch = WORMHOLE_DESTINATION_HINTS.find((value) => {
    return (
      HINT_LABELS[value].toLowerCase() === trimmed.toLowerCase()
      || value === trimmed.toLowerCase()
    );
  });
  if (hintMatch !== undefined) {
    commitScannerLeadsValue(
      `${HINT_PREFIX}${hintMatch}`,
      onChange,
      onSetDestination,
      onLinkOrigin,
      originSystemId,
    );
    return;
  }
  const parsed = parse(trimmed);
  if (parsed.ok) {
    if (parsed.params.system.id !== originSystemId) {
      onSetDestination(parsed.params.system.id);
    }
    return;
  }
  const dash = trimmed.lastIndexOf(' - ');
  if (dash > 0) {
    const named = parse(trimmed.slice(0, dash));
    if (named.ok && named.params.system.id !== originSystemId) {
      onSetDestination(named.params.system.id);
    }
  }
}

function typeGroupsAsComboItems(
  groups: readonly ScannerTypeSuggestionGroup[],
  classLabelOf: (code: string) => string | null,
): readonly ScannerIdentifySuggestionGroup[] {
  return groups.map((group) => ({
    label: group.label,
    items: group.items.map((code) => ({
      value: code,
      text: code,
      meta: code === FAR_SIDE_WORMHOLE_CODE ? '' : (classLabelOf(code) ?? ''),
    })),
  }));
}

function ScannerComboPanel({
  groups,
  itemValues,
  showLabels,
  footer,
}: {
  readonly groups: readonly ScannerIdentifySuggestionGroup[];
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

/** Compact destination combobox: class hints on click, systems on type. */
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
  return (
    <Combobox.Root
      open={popup.open}
      onOpenChange={popup.onOpenChange}
      value={query}
      onValueChange={(next, details) => {
        if (details.reason === 'item-press') {
          commitScannerLeadsValue(
            next,
            onChange,
            onSetDestination,
            onLinkOrigin,
            originSystemId,
          );
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
          commitScannerLeadsQuery(
            query,
            parse,
            offeredLeads,
            onChange,
            onSetDestination,
            onLinkOrigin,
            originSystemId,
          );
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

/** Read-only compact mass / life / leads text when the row cannot be edited. */
export function scannerMassReadout(value: ConnectionEditorDetail['massState']): string {
  return value === null ? '—' : MASS_SHORT[value];
}

/** Read-only compact lifetime text when the row cannot be edited. */
export function scannerLifeReadout(value: ConnectionEditorDetail['lifeStage']): string {
  return value === null ? '—' : LIFE_SHORT[value];
}

/** Read-only compact leads text when the row cannot be edited. */
export function scannerLeadsReadout(
  hint: WormholeDestinationHint | null,
  destination: SystemIdentityReadout | null,
): string {
  if (destination !== null) return destination.label;
  return hint === null ? 'Unset' : HINT_LABELS[hint];
}
