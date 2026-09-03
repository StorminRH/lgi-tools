'use client';

import type { ReactNode } from 'react';
import { usePreference } from '@/components/PreferencesProvider';
import { SegmentedControl } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import type {
  BooleanMenuControlModel,
  EnumMenuControlModel,
  MenuControlModel,
} from '@/platform/page-settings/controls';

function SettingsRowFrame({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ui text-text">{label}</span>

      {children}
    </div>

  );
}

function EnumSettingsRow({ model }: { model: EnumMenuControlModel }) {
  const [value, setValue] = usePreference(model.def);
  return (
    <SettingsRowFrame label={model.label}>
      <SegmentedControl
        options={model.options.map((option) => ({ value: option, label: option }))}
        value={value}
        onChange={setValue}
        label={model.label}
      />
    </SettingsRowFrame>

  );
}

function BooleanSettingsRow({ model }: { model: BooleanMenuControlModel }) {
  const [value, setValue] = usePreference(model.def);
  return (
    <SettingsRowFrame label={model.label}>
      <Switch
        checked={value}
        onCheckedChange={setValue}
        label={model.label}
        tone="neutral"
      />
    </SettingsRowFrame>

  );
}

export function SettingsControlRow({ model }: { model: MenuControlModel }) {
  if (model.kind === 'preference-boolean') {
    return <BooleanSettingsRow model={model} />;
  }
  return <EnumSettingsRow model={model} />;
}
