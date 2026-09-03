'use client';

import type { ReactNode } from 'react';
import { usePageSettings } from '@/components/composition/PageMenuProvider';
import { usePreference } from '@/components/PreferencesProvider';
import { menuControlRow, menuSection, menuSectionLabel } from '@/components/ui/menu';
import { SegmentedControl } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import {
  resolveMenuControls,
  type BooleanMenuControlModel,
  type EnumMenuControlModel,
  type MenuControlModel,
} from '@/platform/page-settings/controls';

function ControlRowFrame({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={menuControlRow}>
      <span className="text-label">{label}</span>

      {children}
    </div>

  );
}

function EnumControlRow({ model }: { model: EnumMenuControlModel }) {
  const [value, setValue] = usePreference(model.def);
  return (
    <ControlRowFrame label={model.label}>
      <SegmentedControl
        options={model.options.map((option) => ({ value: option, label: option }))}
        value={value}
        onChange={setValue}
        label={model.label}
      />
    </ControlRowFrame>

  );
}

function BooleanControlRow({ model }: { model: BooleanMenuControlModel }) {
  const [value, setValue] = usePreference(model.def);
  return (
    <ControlRowFrame label={model.label}>
      <Switch
        checked={value}
        onCheckedChange={setValue}
        label={model.label}
        tone="neutral"
      />
    </ControlRowFrame>

  );
}

function ControlRow({ model }: { model: MenuControlModel }) {
  if (model.kind === 'preference-boolean') {
    return <BooleanControlRow model={model} />;
  }
  return <EnumControlRow model={model} />;
}

export function PageMenuSection() {
  const spec = usePageSettings();
  const models = resolveMenuControls(spec);
  if (models.length === 0) return null;

  const title = spec?.title ?? 'Page settings';
  return (
    <div data-page-menu-section className={menuSection} role="group" aria-label={title}>
      <div className={menuSectionLabel} aria-hidden="true">
        {title}
      </div>

      {models.map((model) => (
        <ControlRow key={model.key} model={model} />
      ))}
    </div>

  );
}
