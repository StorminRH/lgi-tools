'use client';

import type { ReactNode } from 'react';
import { usePageSettings } from '@/components/composition/PageMenuProvider';
import { PreferenceControl } from '@/components/preference-control';
import { MenuGroup, menuControlRow } from '@/components/ui/menu';
import { resolveMenuControls } from '@/platform/page-settings/controls';

export function PageMenuSection({ children }: { children?: ReactNode }) {
  const spec = usePageSettings();
  const models = resolveMenuControls(spec);
  if (models.length === 0 && children == null) return null;

  const title = spec?.title ?? 'Page settings';
  return (
    <MenuGroup data-page-menu-section label={title}>
      {models.map((model) => (
        <div key={model.key} className={menuControlRow}>
          <span>{model.label}</span>
          <PreferenceControl model={model} />
        </div>
      ))}
      {children}
    </MenuGroup>
  );
}
