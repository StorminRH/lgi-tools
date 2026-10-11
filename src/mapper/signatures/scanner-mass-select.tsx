'use client';

import { Select } from '@/components/ui/select';
import {
  CONNECTION_MASS_STATES,
  type ConnectionMassState,
} from '@/data/eve-data/wormhole-contract';
import {
  decodeOptionalField,
  encodeOptionalField,
  UNSET_FIELD,
} from '../authoring/connection-field-group';
import type { ConnectionFieldSetters } from '../authoring/connection-fields';
import { MASS_STATE_LABELS } from '../authoring/connection-labels';
import type { ConnectionEditorDetail } from '../chain/connection-detail';
import { scannerSelectedFieldClass } from './scanner-field-class';
import { useCloseOnScannerScroll } from './scanner-scroll-dismiss';

const MASS_SHORT: Record<ConnectionMassState, string> = {
  stable: '>50%',
  reduced: '<50%',
  critical: '<10%',
};

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
          label: MASS_STATE_LABELS[state],
          triggerLabel: MASS_SHORT[state],
        })),
      ]}
    />
  );
}

export function scannerMassReadout(value: ConnectionEditorDetail['massState']): string {
  return value === null ? '—' : MASS_SHORT[value];
}
