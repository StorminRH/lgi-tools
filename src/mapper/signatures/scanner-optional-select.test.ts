import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type {
  ConnectionMassState,
  WormholeLifeStage,
} from '@/data/eve-data/wormhole-contract';
import { LIFE_STAGE_LABELS, MASS_STATE_LABELS } from '../authoring/connection-labels';
import {
  ScannerOptionalSelect,
  scannerLifeReadout,
  scannerLifeTriggerLabel,
  scannerMassReadout,
} from './scanner-optional-select';

interface SelectProbe {
  readonly ariaLabel: string;
  readonly value: string;
  readonly caret: boolean;
  readonly items: readonly {
    readonly value: string;
    readonly label: string;
    readonly triggerLabel?: string;
  }[];
  readonly onValueChange: (next: string) => void;
}

const select = vi.hoisted(() => ({ last: null as SelectProbe | null }));

vi.mock('@/components/ui/select', () => ({
  Select: (props: SelectProbe) => {
    select.last = props;
    return null;
  },
}));

function renderSelect<T extends string>(
  props: Parameters<typeof ScannerOptionalSelect<T>>[0],
): SelectProbe {
  select.last = null;
  renderToStaticMarkup(createElement(ScannerOptionalSelect<T>, props));
  if (select.last === null) return expect.unreachable('Select did not render');
  return select.last;
}

it('uses compact mass and lifetime text, with a dash for unset', () => {
  expect(scannerMassReadout('stable')).toBe('>50%');
  expect(scannerMassReadout('reduced')).toBe('<50%');
  expect(scannerMassReadout('critical')).toBe('<10%');
  expect(scannerMassReadout(null)).toBe('—');

  expect(scannerLifeReadout('under_1_day')).toBe('<1d');
  expect(scannerLifeReadout('under_4_hours')).toBe('<4h');
  expect(scannerLifeReadout('under_1_hour')).toBe('<1h');
  expect(scannerLifeReadout('expired')).toBe('Exp');
  expect(scannerLifeReadout(null)).toBe('—');
});

it('lists a dash unset item and long labels, shows compact trigger text, and decodes the pick', () => {
  const onChange = vi.fn<(value: ConnectionMassState | null) => void>();
  const unset = renderSelect<ConnectionMassState>({
    ariaLabel: 'Mass WHL-001',
    value: null,
    options: ['stable', 'reduced', 'critical'],
    labels: MASS_STATE_LABELS,
    triggerLabelOf: scannerMassReadout,
    disabled: false,
    onChange,
  });
  expect(unset.ariaLabel).toBe('Mass WHL-001');
  expect(unset.value).toBe('');
  expect(unset.caret).toBe(true);
  expect(unset.items).toStrictEqual([
    { value: '', label: '—' },
    { value: 'stable', label: 'More than 50% remaining', triggerLabel: '>50%' },
    { value: 'reduced', label: 'Less than 50% remaining', triggerLabel: '<50%' },
    { value: 'critical', label: 'Less than 10% remaining', triggerLabel: '<10%' },
  ]);

  unset.onValueChange('critical');
  expect(onChange).toHaveBeenLastCalledWith('critical');
  unset.onValueChange('');
  expect(onChange).toHaveBeenLastCalledWith(null);

  const chosen = renderSelect<ConnectionMassState>({
    ariaLabel: 'Mass WHL-001',
    value: 'reduced',
    options: ['stable', 'reduced', 'critical'],
    labels: MASS_STATE_LABELS,
    triggerLabelOf: scannerMassReadout,
    disabled: false,
    onChange,
  });
  expect(chosen.value).toBe('reduced');
  expect(chosen.caret).toBe(false);
});

it('shows the codex upper bound on the life trigger only for the selected stage', () => {
  const stages: readonly WormholeLifeStage[] = [
    'under_1_day',
    'under_4_hours',
    'under_1_hour',
    'expired',
  ];
  const triggerLabels = (
    selected: WormholeLifeStage | null,
    upperBound: string,
  ) =>
    renderSelect<WormholeLifeStage>({
      ariaLabel: 'Reliable Lifetime WHL-001',
      value: selected,
      options: stages,
      labels: LIFE_STAGE_LABELS,
      triggerLabelOf: scannerLifeTriggerLabel(selected, upperBound),
      disabled: false,
      onChange: vi.fn(),
    }).items.map((item) => item.triggerLabel);

  expect(triggerLabels('under_4_hours', '≤3h 12m')).toStrictEqual([
    undefined,
    '<1d',
    '≤3h 12m',
    '<1h',
    'Exp',
  ]);
  expect(triggerLabels('under_4_hours', '—')).toStrictEqual([
    undefined,
    '<1d',
    '<4h',
    '<1h',
    'Exp',
  ]);
  expect(triggerLabels(null, '≤3h 12m')).toStrictEqual([
    undefined,
    '<1d',
    '<4h',
    '<1h',
    'Exp',
  ]);
});
