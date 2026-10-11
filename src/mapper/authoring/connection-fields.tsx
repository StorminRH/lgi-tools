'use client';

import { Button } from '@/components/ui/button';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { Tooltip } from '@/components/ui/tooltip';
import type { SystemIdentityReadout } from '@/data/eve-data/system-identity';
import {
  CONNECTION_MASS_STATES,
  WORMHOLE_DESTINATION_HINTS,
  WORMHOLE_LIFE_STAGES,
  WORMHOLE_SIZE_CLASSES,
  type ConnectionMassState,
  type WormholeDestinationHint,
  type WormholeLifeStage,
  type WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import {
  doorHint,
  lifetimeStage,
} from '@/data/maps/connection-hallway';
import { formatQuantity } from '@/lib/format/number';
import type { ConnectionEditorDetail } from '../chain/connection-detail';
import {
  ConnectionFieldGroup,
  encodeOptionalField,
  FieldReadout,
  OptionalSelectField,
  UNSET_FIELD,
} from './connection-field-group';
import {
  DESTINATION_HINT_LABELS,
  LIFE_STAGE_LABELS,
  leadsToReadout,
  MASS_STATE_LABELS,
} from './connection-labels';
import {
  codexPanelFacts,
  formatDurationBound,
  isCodexSizeLocked,
  lifetimeRowDisplay,
  massRowDisplay,
  type CodexPanelFacts,
  type LifetimeRowDisplay,
  type MassRowDisplay,
} from './connection-intelligence';
import { dispatchLeadsToChange, encodeOriginLead } from './leads-to-origin';
import { SystemTerminalSearch } from './system-terminal-search';
import {
  useWormholeTypeSearch,
  type WormholeTypeErr,
  type WormholeTypeParams,
} from './wormhole-type-search';

const MASS_ITEMS = [
  { value: UNSET_FIELD, label: 'Unset' },
  ...CONNECTION_MASS_STATES.map((value) => ({
    value,
    label: MASS_STATE_LABELS[value],
  })),
];

const SIZE_ITEMS = [
  { value: UNSET_FIELD, label: 'Unset' },
  ...WORMHOLE_SIZE_CLASSES.map((value) => ({ value, label: value })),
];

const LIFE_ITEMS = [
  { value: UNSET_FIELD, label: 'Unset' },
  ...WORMHOLE_LIFE_STAGES.map((value) => ({
    value,
    label: LIFE_STAGE_LABELS[value],
  })),
];

export interface ConnectionFieldSetters {
  readonly setWormholeType: (value: string | null) => void;
  readonly setShipSize: (value: WormholeSizeClass | null) => void;
  readonly setMassState: (value: ConnectionMassState | null) => void;
  readonly setLifeStage: (value: WormholeLifeStage | null) => void;
  readonly setLeadsTo: (value: WormholeDestinationHint | null) => void;
  readonly setDestination: (toSystemId: number | null) => void;
  readonly linkToOrigin: (resolvedConnectionId: string) => void;
}

export interface OriginLeadOption {
  readonly connectionId: string;
  readonly label: string;
  readonly systemId: number;
}

export interface ConnectionFieldsProps {
  readonly connection: ConnectionEditorDetail;
  readonly codes: readonly string[];
  readonly preferredCodes?: readonly string[];
  readonly entry: WormholeCodexEntry | null;
  readonly setters: ConnectionFieldSetters;
  readonly now: number;
  readonly mode: 'edit' | 'restore';
  readonly destination?: SystemIdentityReadout | null;
  readonly onDelete?: () => void;
  readonly onRestore?: () => void;
  readonly originLeads?: readonly OriginLeadOption[];
}

export function ConnectionFields({
  connection,
  codes,
  preferredCodes,
  entry,
  setters,
  now,
  mode,
  destination,
  onDelete,
  onRestore,
  originLeads = [],
}: ConnectionFieldsProps) {
  const readOnly = mode === 'restore';
  return (
    <div
      data-map-connection-fields
      className="flex flex-col items-center gap-3 text-center"
    >
      {readOnly ? (
        <p
          data-map-connection-restore-mode
          className="font-data text-micro text-muted"
        >
          Severed connection — restore within the undo window.
        </p>
      ) : null}
      <TypeField
        connection={connection}
        codes={codes}
        preferredCodes={preferredCodes}
        readOnly={readOnly}
        onChange={setters.setWormholeType}
      />
      <CodexPanel entry={entry} />
      <SizeField
        connection={connection}
        entry={entry}
        readOnly={readOnly}
        onChange={setters.setShipSize}
      />
      <MassSection
        connection={connection}
        entry={entry}
        readOnly={readOnly}
        onChange={setters.setMassState}
      />
      <LifetimeSection
        connection={connection}
        entry={entry}
        now={now}
        readOnly={readOnly}
        onChange={setters.setLifeStage}
      />
      <LeadsToField
        connection={connection}
        destination={destination ?? null}
        originLeads={originLeads}
        readOnly={readOnly}
        onChangeHint={setters.setLeadsTo}
        onSetDestination={setters.setDestination}
        onLinkOrigin={setters.linkToOrigin}
      />
      <ConnectionActions
        mode={mode}
        onDelete={onDelete}
        onRestore={onRestore}
      />
    </div>
  );
}

function TypeField({
  connection,
  codes,
  preferredCodes,
  readOnly,
  onChange,
}: {
  readonly connection: ConnectionEditorDetail;
  readonly codes: readonly string[];
  readonly preferredCodes?: readonly string[];
  readonly readOnly: boolean;
  readonly onChange: (value: string | null) => void;
}) {
  const search = useWormholeTypeSearch(codes, preferredCodes);
  const typeCode = connection.from.typeCode;
  const typeInitial = encodeOptionalField(typeCode);
  return (
    <ConnectionFieldGroup label="Wormhole type">
      {readOnly ? (
        <FieldReadout
          attr="data-map-connection-type-readout"
          text={typeCode ?? 'Unset'}
        />
      ) : (
        <TerminalSearch<WormholeTypeParams, WormholeTypeErr>
          key={`${connection.connectionId}:${typeInitial}`}
          initialValue={typeInitial}
          placeholder="Type code — e.g. B274 or K162"
          parse={search.parse}
          suggest={search.suggest}
          errorMessage={() => 'No wormhole type matches that code.'}
          onSubmit={(params) => onChange(params.code)}
          onClear={() => onChange(null)}
          errorLabel="Type"
        />
      )}
    </ConnectionFieldGroup>
  );
}

function CodexPanel({ entry }: { readonly entry: WormholeCodexEntry | null }) {
  const codex = codexPanelFacts(entry);
  if (codex === null) return null;
  return <CodexPanelBody facts={codex} />;
}

function CodexPanelBody({ facts }: { readonly facts: CodexPanelFacts }) {
  return (
    <div
      data-map-connection-codex
      className="flex w-full flex-col gap-1 rounded-ctl border border-border-soft px-2 py-1.5 text-center"
    >
      <CodexFact label="Total mass" value={formatFactKg(facts.totalMassKg)} />
      <CodexFact label="Per-jump" value={formatFactKg(facts.maxJumpMassKg)} />
      {facts.massRegenKg > 0 ? (
        <CodexFact label="Regeneration" value={formatFactKg(facts.massRegenKg)} />
      ) : null}
      <CodexFact
        label="Lifetime"
        value={formatDurationBound(facts.lifetimeMinutes * 60 * 1000)}
      />
      <CodexFact label="Size" value={facts.sizeClass} />
    </div>
  );
}

function SizeField({
  connection,
  entry,
  readOnly,
  onChange,
}: {
  readonly connection: ConnectionEditorDetail;
  readonly entry: WormholeCodexEntry | null;
  readonly readOnly: boolean;
  readonly onChange: (value: WormholeSizeClass | null) => void;
}) {
  const lockedSize = isCodexSizeLocked(entry);
  const lockedValue = lockedSize
    ? entry.sizeClass
    : (connection.shipSize ?? 'Unset');
  return (
    <OptionalSelectField
      label="Size"
      ariaLabel="Size"
      items={SIZE_ITEMS}
      value={connection.shipSize}
      readOnly={lockedSize || readOnly}
      readoutAttr="data-map-connection-size-locked"
      readoutText={lockedValue}
      onChange={(value) => onChange(value as WormholeSizeClass | null)}
    />
  );
}

function MassSection({
  connection,
  entry,
  readOnly,
  onChange,
}: {
  readonly connection: ConnectionEditorDetail;
  readonly entry: WormholeCodexEntry | null;
  readonly readOnly: boolean;
  readonly onChange: (value: ConnectionMassState | null) => void;
}) {
  const massState = connection.massState;
  return (
    <OptionalSelectField
      label="Mass"
      ariaLabel="Mass"
      items={MASS_ITEMS}
      value={massState}
      readOnly={readOnly}
      readoutAttr="data-map-connection-mass-state-readout"
      readoutText={massState === null ? 'Unset' : MASS_STATE_LABELS[massState]}
      onChange={(value) => onChange(value as ConnectionMassState | null)}
    >
      <MassEstimateView
        display={massRowDisplay(
          entry,
          massState,
          connection.observedMassKg,
          connection.observedMassAtStateKg,
        )}
      />
    </OptionalSelectField>
  );
}

function MassEstimateView({ display }: { readonly display: MassRowDisplay }) {
  if (display.kind === 'range') {
    return (
      <Tooltip content={display.title}>
        <p
          tabIndex={0}
          data-map-connection-mass-range=""
          className="font-data text-micro text-muted"
        >
          Remaining mass {display.label}
        </p>
      </Tooltip>
    );
  }
  if (display.kind === 'regenerates') {
    return (
      <p
        data-map-connection-mass-regen
        className="font-data text-micro text-muted"
      >
        {display.label}
      </p>
    );
  }
  return null;
}

function LifetimeSection({
  connection,
  entry,
  now,
  readOnly,
  onChange,
}: {
  readonly connection: ConnectionEditorDetail;
  readonly entry: WormholeCodexEntry | null;
  readonly now: number;
  readonly readOnly: boolean;
  readonly onChange: (value: WormholeLifeStage | null) => void;
}) {
  const stage = lifetimeStage(connection.lifetime);
  return (
    <OptionalSelectField
      label="Reliable Lifetime"
      ariaLabel="Reliable Lifetime"
      items={LIFE_ITEMS}
      value={stage}
      readOnly={readOnly}
      readoutAttr="data-map-connection-life-readout"
      readoutText={stage === null ? 'Unset' : LIFE_STAGE_LABELS[stage]}
      onChange={(value) => onChange(value as WormholeLifeStage | null)}
    >
      <LifetimeEstimateView
        display={lifetimeRowDisplay(connection, entry, now)}
      />
    </OptionalSelectField>
  );
}

function LifetimeEstimateView({
  display,
}: {
  readonly display: LifetimeRowDisplay;
}) {
  if (display.kind === 'range' || display.kind === 'ceiling') {
    return (
      <Tooltip content={display.title}>
        <p
          tabIndex={0}
          data-map-connection-lifetime=""
          data-lifetime-kind={display.kind}
          className="font-data text-micro text-muted"
        >
          Lifetime {display.label}
        </p>
      </Tooltip>
    );
  }
  if (display.kind === 'expired') {
    return (
      <p
        data-map-connection-lifetime
        data-lifetime-kind="expired"
        className="font-data text-micro text-hostile"
      >
        {display.label}
      </p>
    );
  }
  return null;
}

function LeadsToField({
  connection,
  destination,
  originLeads,
  readOnly,
  onChangeHint,
  onSetDestination,
  onLinkOrigin,
}: {
  readonly connection: ConnectionEditorDetail;
  readonly destination: SystemIdentityReadout | null;
  readonly originLeads: readonly OriginLeadOption[];
  readonly readOnly: boolean;
  readonly onChangeHint: (value: WormholeDestinationHint | null) => void;
  readonly onSetDestination: (toSystemId: number | null) => void;
  readonly onLinkOrigin: (resolvedConnectionId: string) => void;
}) {
  const hint = doorHint(connection.from);
  if (!readOnly && destination !== null) {
    return (
      <ConnectionFieldGroup label="Leads to">
        <SystemTerminalSearch
          key={`${connection.connectionId}:${destination.label}`}
          initialValue={destination.label}
          placeholder="System name — e.g. J120924"
          excludeSystemId={connection.fromSystemId}
          onPick={onSetDestination}
          onClear={() => onSetDestination(null)}
          errorLabel="Destination"
        />
      </ConnectionFieldGroup>
    );
  }
  const items = [
    { value: UNSET_FIELD, label: 'Unset' },
    ...originLeads.map((option) => ({
      value: encodeOriginLead(option.connectionId),
      label: option.label,
    })),
    ...WORMHOLE_DESTINATION_HINTS.map((value) => ({
      value,
      label: DESTINATION_HINT_LABELS[value],
    })),
  ];
  return (
    <OptionalSelectField
      label="Leads to"
      ariaLabel="Leads to"
      items={items}
      value={hint}
      readOnly={readOnly}
      readoutAttr="data-map-connection-leads-readout"
      readoutText={leadsToReadout(hint, destination)}
      onChange={(value) =>
        dispatchLeadsToChange(value, onLinkOrigin, (nextHint) =>
          onChangeHint(nextHint as WormholeDestinationHint | null),
        )
      }
    />
  );
}

function ConnectionActions({
  mode,
  onDelete,
  onRestore,
}: {
  readonly mode: 'edit' | 'restore';
  readonly onDelete?: () => void;
  readonly onRestore?: () => void;
}) {
  if (mode === 'edit' && onDelete !== undefined) {
    return (
      <div className="flex w-full justify-center">
        <Button
          variant="danger"
          size="sm"
          data-map-connection-delete
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    );
  }
  if (mode === 'restore' && onRestore !== undefined) {
    return (
      <div className="flex w-full justify-center">
        <Button
          variant="primary"
          size="sm"
          data-map-connection-restore
          onClick={onRestore}
        >
          Restore
        </Button>
      </div>
    );
  }
  return null;
}

function CodexFact({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 font-data text-micro">
      <span className="text-muted">{label}</span>
      <span data-map-codex-fact={label} className="text-name">
        {value}
      </span>
    </div>
  );
}

function formatFactKg(kg: number): string {
  return `${formatQuantity(kg)} kg`;
}
