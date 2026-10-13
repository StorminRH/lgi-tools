import type {
  ConnectionMassState,
  WormholeDestinationHint,
  WormholeLifeStage,
} from '@/data/eve-data/wormhole-contract';
import { UNSET_FIELD } from './connection-field-group';

export const MASS_STATE_LABELS: Readonly<Record<ConnectionMassState, string>> = {
  stable: 'More than 50% remaining',
  reduced: 'Less than 50% remaining',
  critical: 'Less than 10% remaining',
};

export const LIFE_STAGE_LABELS: Readonly<Record<WormholeLifeStage, string>> = {
  under_1_day: 'Less than 1 day remaining',
  under_4_hours: 'Less than 4 hours remaining',
  under_1_hour: 'Less than 1 hour remaining',
  expired: 'Expired, closure imminent',
};

/** Typed-label matching in the scanner leads combo depends on this exact text, en dashes included. */
export const DESTINATION_HINT_LABELS: Readonly<
  Record<WormholeDestinationHint, string>
> = {
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

/** A resolved destination's label wins, then the door's hint label, then `unset`. */
export function leadsToReadout(
  hint: WormholeDestinationHint | null,
  destination: { readonly label: string } | null,
  unset = 'Unset',
): string {
  if (destination !== null) return destination.label;
  return hint === null ? unset : DESTINATION_HINT_LABELS[hint];
}

/** The label for `value`, or `empty` when the field is unset. */
export function labelOr<T extends string>(
  value: T | null,
  labels: Readonly<Record<T, string>>,
  empty: string,
): string {
  return value === null ? empty : labels[value];
}

/**
 * Select items for an optional field: the unset item first, then one per
 * value. A value carries a trigger label only when `triggerLabelOf` is given.
 */
export function optionalFieldItems<T extends string>(
  values: readonly T[],
  labelOf: (value: T) => string,
  unsetLabel: string,
  triggerLabelOf?: (value: T) => string,
): { readonly value: string; readonly label: string; readonly triggerLabel?: string }[] {
  return [
    { value: UNSET_FIELD, label: unsetLabel },
    ...values.map((value) => ({
      value,
      label: labelOf(value),
      ...(triggerLabelOf === undefined
        ? {}
        : { triggerLabel: triggerLabelOf(value) }),
    })),
  ];
}
