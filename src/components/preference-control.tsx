'use client';

import { usePreference } from '@/components/PreferencesProvider';
import { SegmentedControl } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import type {
  BooleanMenuControlModel,
  EnumMenuControlModel,
  MenuControlModel,
} from '@/platform/page-settings/controls';

function EnumPreferenceControl({ model }: { model: EnumMenuControlModel }) {
  const [value, setValue] = usePreference(model.def);
  return (
    <SegmentedControl
      options={model.options.map((option) => ({ value: option, label: option }))}
      value={value}
      onChange={setValue}
      label={model.label}
    />
  );
}

function BooleanPreferenceControl({ model }: { model: BooleanMenuControlModel }) {
  const [value, setValue] = usePreference(model.def);
  return <Switch checked={value} onCheckedChange={setValue} label={model.label} tone="neutral" />;
}

/** The live control for a menu preference: a segmented control for an enum, a switch for a boolean. */
export function PreferenceControl({ model }: { model: MenuControlModel }) {
  if (model.kind === 'preference-boolean') {
    return <BooleanPreferenceControl model={model} />;
  }
  return <EnumPreferenceControl model={model} />;
}
