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
  description,
  children,
}: {
  label: string;
  description: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-4">
        <span className="text-ui text-text">{label}</span>
        {children}
      </div>
      {description !== undefined ? (
        <span className="font-data text-micro text-muted">{description}</span>
      ) : null}
    </div>
  );
}

function EnumSettingsRow({ model }: { model: EnumMenuControlModel }) {
  const [value, setValue] = usePreference(model.def);
  return (
    <SettingsRowFrame label={model.label} description={model.description}>
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
    <SettingsRowFrame label={model.label} description={model.description}>
      <Switch
        checked={value}
        onCheckedChange={setValue}
        label={model.label}
        tone="neutral"
      />
    </SettingsRowFrame>
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
