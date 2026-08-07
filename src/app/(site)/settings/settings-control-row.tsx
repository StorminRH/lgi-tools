'use client';

import { usePreference } from '@/components/PreferencesProvider';
import { SegmentedControl } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import type {
  BooleanMenuControlModel,
  EnumMenuControlModel,
  MenuControlModel,
} from '@/platform/page-settings/controls';

function EnumSettingsRow({ model }: { model: EnumMenuControlModel }) {
  const [value, setValue] = usePreference(model.def);
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ui text-text">{model.label}</span>
      <SegmentedControl
        options={model.options.map((option) => ({ value: option, label: option }))}
        value={value}
        onChange={setValue}
        label={model.label}
      />
    </div>
  );
}

function BooleanSettingsRow({ model }: { model: BooleanMenuControlModel }) {
  const [value, setValue] = usePreference(model.def);
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ui text-text">{model.label}</span>
      <Switch
        checked={value}
        onCheckedChange={setValue}
        label={model.label}
        tone="neutral"
      />
    </div>
  );
}

/**
 * The account settings page's preference row — the page-styled twin of the
 * portrait menu's ControlRow (PageMenuSection), reading the same
 * PreferencesProvider state so every surface binding a key stays in sync live.
 */
export function SettingsControlRow({ model }: { model: MenuControlModel }) {
  if (model.kind === 'preference-boolean') {
    return <BooleanSettingsRow model={model} />;
  }
  return <EnumSettingsRow model={model} />;
}
