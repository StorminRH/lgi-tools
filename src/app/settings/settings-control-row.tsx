'use client';

import { usePreference } from '@/components/PreferencesProvider';
import { Segmented } from '@/components/ui/segmented';
import type { MenuControlModel } from '@/page-settings/controls';

// The account settings page's segmented preference row — the page-styled twin
// of the portrait menu's ControlRow (PageMenuSection), reading the same
// PreferencesProvider state so every surface binding a key stays in sync live.
export function SettingsControlRow({ model }: { model: MenuControlModel }) {
  const [value, setValue] = usePreference(model.def);
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[11px] text-text">{model.label}</span>
      <Segmented options={model.options} value={value} onChange={setValue} label={model.label} />
    </div>
  );
}
