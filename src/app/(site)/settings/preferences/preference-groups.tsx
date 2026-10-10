'use client';

import { PreferenceControl } from '@/components/preference-control';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionPanel } from '@/components/ui/section-panel';
import type { PageSettingsSpec } from '@/platform/page-settings/types';
import { derivePreferenceGroups, type PreferenceGroupView } from './preferences-view';

function PreferenceGroupCard({ group }: { group: PreferenceGroupView }) {
  return (
    <SectionPanel title={group.title} className="reveal reveal-1">
      <div className="flex flex-col gap-3 px-3.5 py-3.5">
        {group.models.map((model) => (
          <div key={model.key} className="flex items-center justify-between gap-4">
            <span className="text-ui text-text">{model.label}</span>
            <PreferenceControl model={model} />
          </div>
        ))}
      </div>
    </SectionPanel>
  );
}

export function PreferenceGroups({ specs }: { specs: readonly PageSettingsSpec[] }) {
  const groups = derivePreferenceGroups(specs);
  if (groups.length === 0) {
    return (
      <Card className="reveal reveal-1">
        <EmptyState>Nothing to configure yet.</EmptyState>
      </Card>
    );
  }
  return (
    <>
      {groups.map((group) => (
        <PreferenceGroupCard key={group.id} group={group} />
      ))}
    </>
  );
}
