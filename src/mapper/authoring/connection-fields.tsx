'use client';

import { Button } from '@/components/ui/button';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { Tooltip } from '@/components/ui/tooltip';
import {
  CONNECTION_MASS_STATES,
  FAR_SIDE_WORMHOLE_CODE,
  WORMHOLE_DESTINATION_HINTS,
  WORMHOLE_LIFE_STAGES,
  WORMHOLE_SIZE_CLASSES,
  type ConnectionMassState,
  type WormholeDestinationHint,
  type WormholeLifeStage,
  type WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import type { ConnectionDetail } from '../chain/use-map-chain';
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
import type { JumpResolutionModel } from './jump-resolution';
import {
  JumpResolutionChoices,
  type JumpResolutionAnswers,
} from './JumpResolutionPrompt';
import {
  wormholeTypeSearch,
  type WormholeTypeErr,
  type WormholeTypeParams,
} from './wormhole-type-search';


const MASS_ITEMS = [
  { value: UNSET_FIELD, label: 'Unset' },
  ...CONNECTION_MASS_STATES.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  })),
];

const SIZE_ITEMS = [
  { value: UNSET_FIELD, label: 'Unset' },
  ...WORMHOLE_SIZE_CLASSES.map((value) => ({ value, label: value })),
];

const LIFE_LABELS: Record<WormholeLifeStage, string> = {
  under_1_day: 'Less than 1 day',
  under_4_hours: 'Less than 4 hours',
  under_1_hour: 'Less than 1 hour',
  expired: 'Expired',
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

const HINT_ITEMS = [
  { value: UNSET_FIELD, label: 'Unset' },
  ...WORMHOLE_DESTINATION_HINTS.map((value) => ({
    value,
    label: HINT_LABELS[value],
  })),
];

/** Field-scoped setters the card calls for one connection. */
export interface ConnectionFieldSetters {
  readonly setWormholeType: (value: string | null) => void;
  readonly setShipSize: (value: WormholeSizeClass | null) => void;
  readonly setMassState: (value: ConnectionMassState | null) => void;
  readonly setLifeStage: (value: WormholeLifeStage | null) => void;
  readonly setDestinationHint: (value: WormholeDestinationHint | null) => void;
}

/** The card's pending auto-link group: the recorded survivors plus answers. */
export interface ConnectionResolutionControls {
  readonly resolution: JumpResolutionModel;
  readonly answers: JumpResolutionAnswers;
}

/** Props for the connection field form body. */
export interface ConnectionFieldsProps {
  readonly connection: ConnectionDetail;
  readonly codes: readonly string[];
  /** False while the codex is unloaded — the type field parses leniently. */
  readonly codexReady: boolean;
  readonly entry: WormholeCodexEntry | null;
  readonly setters: ConnectionFieldSetters;
  readonly now: number;
  /** Restore-only mode freezes every field control and shows Restore. */
  readonly mode: 'edit' | 'restore';
  /** Present while an assumed auto-link is still answerable on this row. */
  readonly resolutionControls?: ConnectionResolutionControls;
  readonly onSever?: () => void;
  readonly onRestore?: () => void;
}

/**
 * Human-authored connection facts plus codex-driven intelligence. Pure of
 * window/follower chrome so field wiring stays unit-testable.
 */
export function ConnectionFields({
  connection,
  codes,
  codexReady,
  entry,
  setters,
  now,
  mode,
  resolutionControls,
  onSever,
  onRestore,
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
      {!readOnly && resolutionControls !== undefined ? (
        <ResolutionField controls={resolutionControls} />
      ) : null}
      <TypeField
        connection={connection}
        codes={codes}
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
      <StabilityField
        connection={connection}
        readOnly={readOnly}
        onChange={setters.setMassState}
      />
      <MassEstimate entry={entry} connection={connection} />
      <LifeStageField
        connection={connection}
        readOnly={readOnly}
        onChange={setters.setLifeStage}
      />
      <LifetimeEstimate connection={connection} entry={entry} now={now} />
      <LeadsToField
        connection={connection}
        readOnly={readOnly}
        onChange={setters.setDestinationHint}
      />
      <ConnectionActions
        mode={mode}
        onSever={onSever}
        onRestore={onRestore}
      />
    </div>
  );
}

function ResolutionField({
  controls,
}: {
  readonly controls: ConnectionResolutionControls;
}) {
  return (
    <ConnectionFieldGroup label="Auto-link">
      <div data-map-connection-resolution className="flex w-full flex-col gap-1">
        <JumpResolutionChoices
          resolution={controls.resolution}
          answers={controls.answers}
        />
      </div>
    </ConnectionFieldGroup>
  );
}

function TypeField({
  connection,
  codes,
  codexReady,
  readOnly,
  onChange,
}: {
  readonly connection: ConnectionDetail;
  readonly codes: readonly string[];
  readonly codexReady: boolean;
  readonly readOnly: boolean;
  readonly onChange: (value: string | null) => void;
}) {
  const search = wormholeTypeSearch(codes, { lenient: !codexReady });
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
    <div
      data-map-connection-codex
      className="flex w-full flex-col gap-1 rounded-ctl border border-border-soft px-2 py-1.5 text-center"
    >
      <span className="font-data text-label uppercase tracking-label text-isk">
        Codex
      </span>
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
  readonly connection: ConnectionDetail;
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
      label="Ship size"
      ariaLabel="Ship size"
      items={SIZE_ITEMS}
      value={connection.shipSize}
      readOnly={lockedSize || readOnly}
      readoutAttr="data-map-connection-size-locked"
      readoutText={lockedValue}
      onChange={(value) => onChange(value as WormholeSizeClass | null)}
    />
  );
}

function StabilityField({
  connection,
  readOnly,
  onChange,
}: {
  readonly connection: ConnectionDetail;
  readonly readOnly: boolean;
  readonly onChange: (value: ConnectionMassState | null) => void;
}) {
  return (
    <OptionalSelectField
      label="Stability"
      ariaLabel="Mass stability"
      items={MASS_ITEMS}
      value={connection.massState}
      readOnly={readOnly}
      readoutAttr="data-map-connection-mass-state-readout"
      readoutText={connection.massState ?? 'Unset'}
      onChange={(value) => onChange(value as ConnectionMassState | null)}
    />
  );
}

function LeadsToField({
  connection,
  readOnly,
  onChange,
}: {
  readonly connection: ConnectionDetail;
  readonly readOnly: boolean;
  readonly onChange: (value: WormholeDestinationHint | null) => void;
}) {
  // D11: no manual field the codex can fill — a typed origin-side hole already
  // knows where it leads, so the hint control exists only for K162/unidentified.
  const showable =
    connection.wormholeTypeCode === null ||
    connection.wormholeTypeCode === FAR_SIDE_WORMHOLE_CODE;
  if (!showable) return null;
  const hint = connection.fromDestinationHint;
  return (
    <OptionalSelectField
      label="Leads to"
      ariaLabel="Leads to"
      items={HINT_ITEMS}
      value={hint}
      readOnly={readOnly}
      readoutAttr="data-map-connection-leads-readout"
      readoutText={hint === null ? 'Unset' : HINT_LABELS[hint]}
      onChange={(value) => onChange(value as WormholeDestinationHint | null)}
    />
  );
}

function MassEstimate({
  entry,
  connection,
}: {
  readonly entry: WormholeCodexEntry | null;
  readonly connection: ConnectionDetail;
}) {
  return (
    <MassEstimateView
      display={massRowDisplay(
        entry,
        connection.massState,
        connection.observedMassKg,
        connection.observedMassAtStateKg,
      )}
    />
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

function LifeStageField({
  connection,
  readOnly,
  onChange,
}: {
  readonly connection: ConnectionDetail;
  readonly readOnly: boolean;
  readonly onChange: (value: WormholeLifeStage | null) => void;
}) {
  return (
    <OptionalSelectField
      label="Life stage"
      ariaLabel="Life stage"
      items={LIFE_ITEMS}
      value={connection.lifeStage}
      readOnly={readOnly}
      readoutAttr="data-map-connection-life-readout"
      readoutText={
        connection.lifeStage === null ? 'Unset' : LIFE_LABELS[connection.lifeStage]
      }
      onChange={(value) => onChange(value as WormholeLifeStage | null)}
    />
  );
}

function LifetimeEstimate({
  connection,
  entry,
  now,
}: {
  readonly connection: ConnectionDetail;
  readonly entry: WormholeCodexEntry | null;
  readonly now: number;
}) {
  return (
    <LifetimeEstimateView
      display={lifetimeRowDisplay(connection, entry, now)}
    />
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

function ConnectionActions({
  mode,
  onSever,
  onRestore,
}: {
  readonly mode: 'edit' | 'restore';
  readonly onSever?: () => void;
  readonly onRestore?: () => void;
}) {
  if (mode === 'edit' && onSever !== undefined) {
    return (
      <div className="flex w-full justify-center">
        <Button
          variant="danger"
          size="sm"
          data-map-connection-sever
          onClick={onSever}
        >
          Sever
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
