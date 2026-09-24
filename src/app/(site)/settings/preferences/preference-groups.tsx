'use client';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import type { PageSettingsSpec } from '@/platform/page-settings/types';
import { SettingsControlRow } from '../settings-control-row';
import { derivePreferenceGroups, type PreferenceGroupView } from './preferences-view';

function PreferenceGroupCard({ group }: { group: PreferenceGroupView }) {
  return (
    <Card>
      <SectionHeader size="md" label={group.title} hint={group.route} />
      <div className="flex flex-col gap-3 px-3.5 py-3.5">
        {group.models.map((model) => (
          <SettingsControlRow key={model.key} model={model} />
        ))}
      </div>
    </Card>
  );
}

export function PreferenceGroups({ specs }: { specs: readonly PageSettingsSpec[] }) {
  const groups = derivePreferenceGroups(specs);
  if (groups.length === 0) {
    return (
      <Card>
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
