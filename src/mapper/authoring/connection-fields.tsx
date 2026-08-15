'use client';

// The Signature Editor's field body (4.0.4.3.2 operator ruling D-G).
//
// Player language throughout: the Mass and Reliable Lifetime vocabularies read
// exactly as EVE's own in-space wording, while the stored vocabularies
// (`stable/reduced/critical`, `under_1_day/…`) are untouched. The field ORDER
// is part of the ruling — wormhole type (with its headerless stats block),
// Size, Mass, Reliable Lifetime, Leads to, Delete — so the tests assert
// position, not just presence.
//
// Pure of window/leader chrome so field wiring stays unit-testable.
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { Tooltip } from '@/components/ui/tooltip';
import {
  useSystemSearch,
  type SystemErr,
  type SystemParams,
} from '@/components/use-system-search';
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
import type { ConnectionEditorDetail } from '../chain/use-map-chain';
import {
  ConnectionFieldGroup,
  encodeOptionalField,
  FieldReadout,
  OptionalSelectField,
  UNSET_FIELD,
} from './connection-field-group';
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
import {
  wormholeTypeSearch,
  type WormholeTypeErr,
  type WormholeTypeParams,
} from './wormhole-type-search';

/** In-game mass wording over the unchanged stored shake-state vocabulary. */
const MASS_LABELS: Record<ConnectionMassState, string> = {
  stable: 'More than 50% remaining',
  reduced: 'Less than 50% remaining',
  critical: 'Less than 10% remaining',
};

const MASS_ITEMS = [
  { value: UNSET_FIELD, label: 'Unset' },
  ...CONNECTION_MASS_STATES.map((value) => ({
    value,
    label: MASS_LABELS[value],
  })),
];

const SIZE_ITEMS = [
  { value: UNSET_FIELD, label: 'Unset' },
  ...WORMHOLE_SIZE_CLASSES.map((value) => ({ value, label: value })),
];

/** In-game lifetime wording over the unchanged stored life-stage vocabulary. */
const LIFE_LABELS: Record<WormholeLifeStage, string> = {
  under_1_day: 'Less than 1 day remaining',
  under_4_hours: 'Less than 4 hours remaining',
  under_1_hour: 'Less than 1 hour remaining',
  expired: 'Expired, closure imminent',
};

const LIFE_ITEMS = [
  { value: UNSET_FIELD, label: 'Unset' },
  ...WORMHOLE_LIFE_STAGES.map((value) => ({
    value,
    label: LIFE_LABELS[value],
  })),
];

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

/** Field-scoped setters the editor calls for one connection. */
export interface ConnectionFieldSetters {
  readonly setWormholeType: (value: string | null) => void;
  readonly setShipSize: (value: WormholeSizeClass | null) => void;
  readonly setMassState: (value: ConnectionMassState | null) => void;
  readonly setLifeStage: (value: WormholeLifeStage | null) => void;
  /** The one "Leads to" hint; the origin side is the editor's own viewpoint. */
  readonly setLeadsTo: (value: WormholeDestinationHint | null) => void;
  /** Retargets or clears the resolved destination system. */
  readonly setDestination: (toSystemId: number | null) => void;
  /** Attaches this stub to a known inbound line the operator picked. */
  readonly linkToOrigin: (resolvedConnectionId: string) => void;
}

/** One named origin system offered in Leads to while the far end is unknown. */
export interface OriginLeadOption {
  readonly connectionId: string;
  readonly label: string;
}

/** Props for the connection field form body. */
export interface ConnectionFieldsProps {
  readonly connection: ConnectionEditorDetail;
  readonly codes: readonly string[];
  readonly preferredCodes?: readonly string[];
  /** False while the codex is unloaded — the type field parses leniently. */
  readonly codexReady: boolean;
  readonly entry: WormholeCodexEntry | null;
  readonly setters: ConnectionFieldSetters;
  readonly now: number;
  /** Restore-only mode freezes every field control and shows Restore. */
  readonly mode: 'edit' | 'restore';
  /**
   * The destination system's identity readout once the hole is resolved. The
   * field stays editable — type a new system name to retarget, or clear it
   * back to the class-hint dropdown.
   */
  readonly destination?: SystemIdentityReadout | null;
  readonly onDelete?: () => void;
  readonly onRestore?: () => void;
  /**
   * Known inbound systems this unresolved stub may attach to. Empty once the
   * hole already has a typed destination.
   */
  readonly originLeads?: readonly OriginLeadOption[];
}

/**
 * Human-authored connection facts plus codex-driven intelligence, in the
 * ruling D-G order.
 */
export function ConnectionFields({
  connection,
  codes,
  preferredCodes,
  codexReady,
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
  const lockedSize = isCodexSizeLocked(entry);
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
        codexReady={codexReady}
        readOnly={readOnly}
        onChange={setters.setWormholeType}
      />
      <CodexPanel entry={entry} />
      <SizeField
        connection={connection}
        entry={entry}
        lockedSize={lockedSize}
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
  codexReady,
  readOnly,
  onChange,
}: {
  readonly connection: ConnectionEditorDetail;
  readonly codes: readonly string[];
  readonly preferredCodes?: readonly string[];
  readonly codexReady: boolean;
  readonly readOnly: boolean;
  readonly onChange: (value: string | null) => void;
}) {
  const search = wormholeTypeSearch(codes, {
    lenient: !codexReady,
    preferredCodes,
  });
  const typeInitial = encodeOptionalField(connection.wormholeTypeCode);
  return (
    <ConnectionFieldGroup label="Wormhole type">
      {readOnly ? (
        <FieldReadout
          attr="data-map-connection-type-readout"
          text={connection.wormholeTypeCode ?? 'Unset'}
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
    // Headerless (D-G): the block sits directly under the type it describes,
    // so a "Codex" caption only repeated what the position already says.
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
  lockedSize,
  readOnly,
  onChange,
}: {
  readonly connection: ConnectionEditorDetail;
  readonly entry: WormholeCodexEntry | null;
  readonly lockedSize: boolean;
  readonly readOnly: boolean;
  readonly onChange: (value: WormholeSizeClass | null) => void;
}) {
  const lockedValue =
    lockedSize && entry !== null && !entry.farSide
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

/** Mass: the in-game shake report plus its one derived remaining-mass line. */
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
  return (
    <ConnectionFieldGroup label="Mass">
      {readOnly ? (
        <FieldReadout
          attr="data-map-connection-mass-state-readout"
          text={
            connection.massState === null
              ? 'Unset'
              : MASS_LABELS[connection.massState]
          }
        />
      ) : (
        <Select
          ariaLabel="Mass"
          align="center"
          value={encodeOptionalField(connection.massState)}
          items={MASS_ITEMS}
          onValueChange={(next) =>
            onChange(
              next === UNSET_FIELD ? null : (next as ConnectionMassState),
            )
          }
        />
      )}
      <MassEstimateView
        display={massRowDisplay(
          entry,
          connection.massState,
          connection.observedMassKg,
          connection.observedMassAtStateKg,
        )}
      />
    </ConnectionFieldGroup>
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

/** Reliable Lifetime: the in-game report plus its one derived countdown line. */
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
  return (
    <ConnectionFieldGroup label="Reliable Lifetime">
      {readOnly ? (
        <FieldReadout
          attr="data-map-connection-life-readout"
          text={
            connection.lifeStage === null
              ? 'Unset'
              : LIFE_LABELS[connection.lifeStage]
          }
        />
      ) : (
        <Select
          ariaLabel="Reliable Lifetime"
          align="center"
          value={encodeOptionalField(connection.lifeStage)}
          items={LIFE_ITEMS}
          onValueChange={(next) =>
            onChange(next === UNSET_FIELD ? null : (next as WormholeLifeStage))
          }
        />
      )}
      <LifetimeEstimateView
        display={lifetimeRowDisplay(connection, entry, now)}
      />
    </ConnectionFieldGroup>
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

/**
 * Leads to: one field (D-G). While the far end is unknown it is the human
 * hint dropdown, plus any already-known inbound systems the operator can
 * attach this stub to. Once a destination is set the field stays a typed
 * system search so a wrong jump or return can be corrected in place.
 */
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
  const search = useSystemSearch();
  const hint = connection.fromDestinationHint;
  if (readOnly) {
    return (
      <ConnectionFieldGroup label="Leads to">
        <FieldReadout
          attr="data-map-connection-leads-readout"
          text={
            destination !== null
              ? destination.label
              : hint === null
                ? 'Unset'
                : HINT_LABELS[hint]
          }
        />
      </ConnectionFieldGroup>
    );
  }
  if (destination !== null) {
    return (
      <ConnectionFieldGroup label="Leads to">
        <TerminalSearch<SystemParams, SystemErr>
          key={`${connection.connectionId}:${destination.label}`}
          initialValue={destination.label}
          placeholder="System name — e.g. J120924"
          parse={(input) => parseDestinationSystem(search.parse, input)}
          suggest={search.suggest}
          errorMessage={() => 'No system matches that name.'}
          onSubmit={(params) => onSetDestination(params.system.id)}
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
      label: HINT_LABELS[value],
    })),
  ];
  return (
    <OptionalSelectField
      label="Leads to"
      ariaLabel="Leads to"
      items={items}
      value={hint}
      readOnly={false}
      readoutAttr="data-map-connection-leads-readout"
      readoutText={hint === null ? 'Unset' : HINT_LABELS[hint]}
      onChange={(value) =>
        dispatchLeadsToChange(value, onLinkOrigin, (nextHint) =>
          onChangeHint(nextHint as WormholeDestinationHint | null),
        )
      }
    />
  );
}

/** Accepts a bare system name or the identity readout ("J120924 - C2"). */
export function parseDestinationSystem(
  parse: (input: string) =>
    | { ok: true; params: SystemParams }
    | { ok: false; error: SystemErr },
  input: string,
): { ok: true; params: SystemParams } | { ok: false; error: SystemErr } {
  const direct = parse(input);
  if (direct.ok) return direct;
  const dash = input.lastIndexOf(' - ');
  if (dash > 0) return parse(input.slice(0, dash));
  return direct;
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
  return `${kg.toLocaleString()} kg`;
}
