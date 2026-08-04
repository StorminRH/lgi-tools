'use client';

import type { ReactNode } from 'react';
import { Select } from '@/components/ui/select';
import { TerminalSearch } from '@/components/ui/terminal-search';
import {
  CONNECTION_MASS_STATES,
  WORMHOLE_LIFE_STAGES,
  WORMHOLE_SIZE_CLASSES,
  type ConnectionMassState,
  type WormholeLifeStage,
  type WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import type { ConnectionDetail } from '../chain/use-map-chain';
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
  readonly setters: ConnectionFieldSetters;
}

/**
 * Human-authored connection facts: type search plus size/stability/life selects.
 * Pure of window/follower chrome so field wiring stays unit-testable.
 */
export function ConnectionFields({
  connection,
  codes,
  setters,
}: ConnectionFieldsProps) {
  const search = wormholeTypeSearch(codes);
  const typeInitial = encodeOptionalField(connection.wormholeTypeCode);

  return (
    <div data-map-connection-fields className="flex flex-col gap-3">
      <FieldBlock label="Wormhole type">
        <TerminalSearch<WormholeTypeParams, WormholeTypeErr>
          key={`${connection.connectionId}:${typeInitial}`}
          initialValue={typeInitial}
          placeholder="Type code — e.g. B274 or K162"
          parse={search.parse}
          suggest={search.suggest}
          errorMessage={() => 'No wormhole type matches that code.'}
          onSubmit={(params) => setters.setWormholeType(params.code)}
          onClear={() => setters.setWormholeType(null)}
          errorLabel="Type"
        />
      </FieldBlock>
      <FieldBlock label="Ship size">
        <Select
          ariaLabel="Ship size"
          value={encodeOptionalField(connection.shipSize)}
          items={SIZE_ITEMS}
          onValueChange={(value) =>
            setters.setShipSize(
              decodeOptionalField(value) as WormholeSizeClass | null,
            )
          }
        />
      </FieldBlock>
      <FieldBlock label="Stability">
        <Select
          ariaLabel="Mass stability"
          value={encodeOptionalField(connection.massState)}
          items={MASS_ITEMS}
          onValueChange={(value) =>
            setters.setMassState(
              decodeOptionalField(value) as ConnectionMassState | null,
            )
          }
        />
      </FieldBlock>
      <FieldBlock label="Life stage">
        <Select
          ariaLabel="Life stage"
          value={encodeOptionalField(connection.lifeStage)}
          items={LIFE_ITEMS}
          onValueChange={(value) =>
            setters.setLifeStage(
              decodeOptionalField(value) as WormholeLifeStage | null,
            )
          }
        />
      </FieldBlock>
    </div>
  );
}

function FieldBlock({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-data text-label uppercase tracking-label text-isk">
        {label}
      </span>
      {children}
    </label>
  );
}
