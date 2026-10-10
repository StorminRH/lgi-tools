'use client';

import { useState } from 'react';
import { Checkbox, type CheckboxTone } from '@/components/ui/checkbox';
import { ChipToggle, ChipToggleGroup, ToggleRow } from '@/components/ui/chip-toggle';
import { Dot } from '@/components/ui/dot';
import { RadioGroup } from '@/components/ui/radio-group';
import { SegmentedControl } from '@/components/ui/segmented';
import { Switch, type SwitchTone } from '@/components/ui/switch';
import { ReferenceGroup, Specimen, Variant } from './specimen';

const CHECKBOX_TONES: readonly CheckboxTone[] = ['green', 'neutral', 'red'];
const SWITCH_TONES: readonly SwitchTone[] = ['green', 'neutral'];

const UNIT_OPTIONS = [
  { value: 'isk', label: 'ISK' },
  { value: 'volume', label: 'm³' },
  { value: 'units', label: 'Units' },
  { value: 'lp', label: 'LP', disabled: true },
];

function ToneChecks() {
  const [checked, setChecked] = useState<Record<CheckboxTone, boolean>>({ green: true, neutral: true, red: false });
  return (
    <div className="flex flex-col gap-2.5">
      {CHECKBOX_TONES.map((tone) => (
        <label key={tone} className="flex cursor-pointer items-center gap-2.5 font-ui text-ui text-text">
          <Checkbox
            tone={tone}
            checked={checked[tone]}
            onCheckedChange={(next) => setChecked((current) => ({ ...current, [tone]: next }))}
            label={`${tone} checkbox`}
          />
          {tone}
        </label>
      ))}
      <label className="flex items-center gap-2.5 font-ui text-ui text-muted">
        <Checkbox checked={false} onCheckedChange={() => undefined} label="Disabled checkbox" disabled />
        disabled
      </label>
    </div>
  );
}

function ToneSwitches() {
  const [on, setOn] = useState<Record<SwitchTone, boolean>>({ green: true, neutral: false });
  return (
    <div className="flex flex-col gap-2.5">
      {SWITCH_TONES.map((tone) => (
        <label key={tone} className="flex cursor-pointer items-center gap-2.5 font-ui text-ui text-text">
          <Switch
            tone={tone}
            checked={on[tone]}
            onCheckedChange={(next) => setOn((current) => ({ ...current, [tone]: next }))}
            label={`${tone} switch`}
          />
          {tone}
        </label>
      ))}
    </div>
  );
}

export function ChoicesGroup() {
  const [basis, setBasis] = useState('sell');
  const [unit, setUnit] = useState('isk');
  const [density, setDensity] = useState('volume');
  const [siteTypes, setSiteTypes] = useState(['gas']);
  const [rows, setRows] = useState(['open']);

  return (
    <ReferenceGroup
      id="choices"
      title="Choices"
      intro="Binary and one-of-many selection, from form checkboxes to pressable filter chips."
    >
      <Specimen
        name="Checkbox + Switch"
        source="checkbox · switch"
        note="Controlled boolean inputs in their tone variants. Callers own the visible label."
      >
        <div className="grid grid-cols-2 gap-6">
          <Variant label="checkbox">
            <ToneChecks />
          </Variant>
          <Variant label="switch">
            <ToneSwitches />
          </Variant>
        </div>
      </Specimen>

      <Specimen
        name="RadioGroup"
        source="radio-group"
        note="One-of-many choice with optional descriptions and per-option disabling."
      >
        <RadioGroup
          label="Price basis"
          value={basis}
          onValueChange={setBasis}
          options={[
            { value: 'sell', label: 'Jita sell', description: 'Lowest sell order in Jita 4-4' },
            { value: 'buy', label: 'Jita buy', description: 'Highest buy order in Jita 4-4' },
            { value: 'average', label: '5-day average', disabled: true },
          ]}
        />
      </Specimen>

      <Specimen
        name="SegmentedControl"
        source="segmented"
        note="A raised selection inside an inset track. Compact density for toolbars; link mode when the choice lives in the URL."
        wide
      >
        <div className="flex flex-wrap items-end gap-8">
          <Variant label="default">
            <SegmentedControl label="Display unit" value={unit} onChange={setUnit} options={UNIT_OPTIONS} />
          </Variant>
          <Variant label="compact">
            <SegmentedControl
              label="Density unit"
              value={density}
              onChange={setDensity}
              options={UNIT_OPTIONS}
              density="compact"
            />
          </Variant>
          <Variant label="link mode">
            <SegmentedControl
              label="Reference sections"
              value="choices"
              options={[
                { value: 'forms', label: 'Forms', href: '#forms' },
                { value: 'choices', label: 'Choices', href: '#choices' },
                { value: 'tags', label: 'Tags', href: '#tags' },
              ]}
            />
          </Variant>
        </div>
      </Specimen>

      <Specimen
        name="ChipToggle + ToggleRow"
        source="chip-toggle"
        note="Multi-select toggles inside a ChipToggleGroup. ChipToggle is a pressable chip that shows its domain colour when pressed and fades when not; ToggleRow is an untinted list row that fills when pressed."
        wide
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Variant label="chip">
            <ChipToggleGroup value={siteTypes} onValueChange={setSiteTypes} label="Wormhole site types">
              <ChipToggle value="gas" tone="orange"><Dot tone="orange" size="sm" /> Gas</ChipToggle>
              <ChipToggle value="ore" tone="blue"><Dot tone="blue" size="sm" /> Ore</ChipToggle>
              <ChipToggle value="relic" tone="green"><Dot tone="green" size="sm" /> Relic</ChipToggle>
            </ChipToggleGroup>
          </Variant>
          <Variant label="row">
            <ChipToggleGroup value={rows} onValueChange={setRows} label="Row toggles">
              <ToggleRow value="open">Open sites</ToggleRow>
              <ToggleRow value="done">Cleared</ToggleRow>
            </ChipToggleGroup>
          </Variant>
        </div>
      </Specimen>
    </ReferenceGroup>
  );
}
