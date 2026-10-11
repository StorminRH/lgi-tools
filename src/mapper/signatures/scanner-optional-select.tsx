'use client';

import { Select } from '@/components/ui/select';
import type {
  ConnectionMassState,
  WormholeLifeStage,
} from '@/data/eve-data/wormhole-contract';
import {
  decodeOptionalField,
  encodeOptionalField,
} from '../authoring/connection-field-group';
import { labelOr, optionalFieldItems } from '../authoring/connection-labels';
import { scannerSelectedFieldClass } from './scanner-field-class';
import { useCloseOnScannerScroll } from './scanner-scroll-dismiss';

const SCANNER_UNSET = '—';

const MASS_SHORT: Readonly<Record<ConnectionMassState, string>> = {
  stable: '>50%',
  reduced: '<50%',
  critical: '<10%',
};

const LIFE_SHORT: Readonly<Record<WormholeLifeStage, string>> = {
  under_1_day: '<1d',
  under_4_hours: '<4h',
  under_1_hour: '<1h',
  expired: 'Exp',
};

/**
 * A scanner row's optional enum field: the long label in the list, the
 * caller's compact text on the trigger, and '—' for unset.
 */
export function ScannerOptionalSelect<T extends string>({
  ariaLabel,
  value,
  options,
  labels,
  triggerLabelOf,
  disabled,
  onChange,
}: {
  readonly ariaLabel: string;
  readonly value: T | null;
  readonly options: readonly T[];
  readonly labels: Readonly<Record<T, string>>;
  readonly triggerLabelOf: (value: T) => string;
  readonly disabled: boolean;
  readonly onChange: (value: T | null) => void;
}) {
  const popup = useCloseOnScannerScroll();
  const selected = value !== null;
  return (
    <Select
      open={popup.open}
      onOpenChange={popup.onOpenChange}
      size="sm"
      ariaLabel={ariaLabel}
      disabled={disabled}
      caret={!selected}
      className={scannerSelectedFieldClass(selected)}
      value={encodeOptionalField(value)}
      onValueChange={(next) => onChange(decodeOptionalField(next) as T | null)}
      items={optionalFieldItems(
        options,
        (option) => labels[option],
        SCANNER_UNSET,
        triggerLabelOf,
      )}
    />
  );
}

export function scannerMassReadout(value: ConnectionMassState | null): string {
  return labelOr(value, MASS_SHORT, SCANNER_UNSET);
}

export function scannerLifeReadout(value: WormholeLifeStage | null): string {
  return labelOr(value, LIFE_SHORT, SCANNER_UNSET);
}

/**
 * Trigger text for the life select: the selected stage shows the codex upper
 * bound when there is one, and every other stage its short label.
 */
export function scannerLifeTriggerLabel(
  selected: WormholeLifeStage | null,
  upperBound: string,
): (stage: WormholeLifeStage) => string {
  return (stage) =>
    stage === selected && upperBound !== SCANNER_UNSET
      ? upperBound
      : LIFE_SHORT[stage];
}
