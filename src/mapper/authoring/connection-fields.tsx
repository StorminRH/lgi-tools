'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { Tooltip } from '@/components/ui/tooltip';
import {
  CONNECTION_MASS_STATES,
  WORMHOLE_LIFE_STAGES,
  WORMHOLE_SIZE_CLASSES,
  type ConnectionMassState,
  type WormholeLifeStage,
  type WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import type { ConnectionDetail } from '../chain/use-map-chain';
import {
  codexPanelFacts,
  isCodexSizeLocked,
  lifetimeRowDisplay,
  massRowDisplay,
  type CodexPanelFacts,
  type LifetimeRowDisplay,
  type MassRowDisplay,
} from './connection-intelligence';
import {
  wormholeTypeSearch,
  type WormholeTypeErr,
  type WormholeTypeParams,
} from './wormhole-type-search';

/** Select sentinel for null / unset field values. */
export const UNSET_FIELD = '';

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

const READOUT_CLASS =
  'block w-full rounded-ctl border border-border-soft px-2 py-1.5 text-center font-data text-ui text-name';

/** Encodes a nullable field for the house Select (empty string = unset). */
export function encodeOptionalField(value: string | null): string {
  return value ?? UNSET_FIELD;
}

/** Decodes a Select value back to null when the unset sentinel is chosen. */
export function decodeOptionalField(value: string): string | null {
  return value === UNSET_FIELD ? null : value;
}

/** Field-scoped setters the card calls for one connection. */
export interface ConnectionFieldSetters {
  readonly setWormholeType: (value: string | null) => void;
  readonly setShipSize: (value: WormholeSizeClass | null) => void;
  readonly setMassState: (value: ConnectionMassState | null) => void;
  readonly setLifeStage: (value: WormholeLifeStage | null) => void;
}

/** Props for the connection field form body. */
export interface ConnectionFieldsProps {
  readonly connection: ConnectionDetail;
  readonly codes: readonly string[];
  readonly entry: WormholeCodexEntry | null;
  readonly setters: ConnectionFieldSetters;
  readonly now: number;
  /** Restore-only mode freezes every field control and shows Restore. */
  readonly mode: 'edit' | 'restore';
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
  entry,
  setters,
  now,
  mode,
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
      <TypeField
        connection={connection}
        codes={codes}
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
      <MassEstimate entry={entry} massState={connection.massState} />
      <LifeStageField
        connection={connection}
        readOnly={readOnly}
        onChange={setters.setLifeStage}
      />
      <LifetimeEstimate connection={connection} entry={entry} now={now} />
      <ConnectionActions
        mode={mode}
        onSever={onSever}
        onRestore={onRestore}
      />
    </div>
  );
}

function TypeField({
  connection,
  codes,
  readOnly,
  onChange,
}: {
  readonly connection: ConnectionDetail;
  readonly codes: readonly string[];
  readonly readOnly: boolean;
  readonly onChange: (value: string | null) => void;
}) {
  const search = wormholeTypeSearch(codes);
  const typeInitial = encodeOptionalField(connection.wormholeTypeCode);
  return (
    <FieldBlock label="Wormhole type">
      {readOnly ? (
        <span data-map-connection-type-readout="" className={READOUT_CLASS}>
          {connection.wormholeTypeCode ?? 'Unset'}
        </span>
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
    </FieldBlock>
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
      <CodexFact
        label="Regeneration"
        value={facts.massRegenKg > 0 ? formatFactKg(facts.massRegenKg) : 'None'}
      />
      <CodexFact label="Lifetime" value={`${facts.lifetimeMinutes / 60}h`} />
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
    <FieldBlock label="Ship size">
      {lockedSize || readOnly ? (
        <span data-map-connection-size-locked="" className={READOUT_CLASS}>
          {lockedValue}
        </span>
      ) : (
        <Select
          ariaLabel="Ship size"
          align="center"
          value={encodeOptionalField(connection.shipSize)}
          items={SIZE_ITEMS}
          onValueChange={(value) =>
            onChange(decodeOptionalField(value) as WormholeSizeClass | null)
          }
        />
      )}
    </FieldBlock>
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
    <FieldBlock label="Stability">
      {readOnly ? (
        <span
          data-map-connection-mass-state-readout=""
          className={READOUT_CLASS}
        >
          {connection.massState ?? 'Unset'}
        </span>
      ) : (
        <Select
          ariaLabel="Mass stability"
          align="center"
          value={encodeOptionalField(connection.massState)}
          items={MASS_ITEMS}
          onValueChange={(value) =>
            onChange(decodeOptionalField(value) as ConnectionMassState | null)
          }
        />
      )}
    </FieldBlock>
  );
}

function MassEstimate({
  entry,
  massState,
}: {
  readonly entry: WormholeCodexEntry | null;
  readonly massState: ConnectionMassState | null;
}) {
  return <MassEstimateView display={massRowDisplay(entry, massState)} />;
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
    <FieldBlock label="Life stage">
      {readOnly ? (
        <span data-map-connection-life-readout="" className={READOUT_CLASS}>
          {connection.lifeStage === null
            ? 'Unset'
            : LIFE_LABELS[connection.lifeStage]}
        </span>
      ) : (
        <Select
          ariaLabel="Life stage"
          align="center"
          value={encodeOptionalField(connection.lifeStage)}
          items={LIFE_ITEMS}
          onValueChange={(value) =>
            onChange(decodeOptionalField(value) as WormholeLifeStage | null)
          }
        />
      )}
    </FieldBlock>
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

function FieldBlock({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="flex w-full flex-col items-center gap-1 text-center [&_input]:text-center">
      <span className="font-data text-label uppercase tracking-label text-isk">
        {label}
      </span>
      <div className="w-full">{children}</div>
    </label>
  );
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
