'use client';

import { Select } from '@/components/ui/select';
import {
  WORMHOLE_LIFE_STAGES,
  type WormholeLifeStage,
} from '@/data/eve-data/wormhole-contract';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import {
  decodeOptionalField,
  encodeOptionalField,
  UNSET_FIELD,
} from '../authoring/connection-field-group';
import type { ConnectionFieldSetters } from '../authoring/connection-fields';
import type { ConnectionEditorDetail } from '../chain/connection-detail';
import { scannerSelectedFieldClass } from './scanner-field-class';
import { useCloseOnScannerScroll } from './scanner-scroll-dismiss';
import { scannerLifeUpperBound } from './signature-model';

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
  readonly value: WormholeLifeStage | null;
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

/** Read-only compact lifetime text when the row cannot be edited. */
export function scannerLifeReadout(value: WormholeLifeStage | null): string {
  return value === null ? '—' : LIFE_SHORT[value];
}
