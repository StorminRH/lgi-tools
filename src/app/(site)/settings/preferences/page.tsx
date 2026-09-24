import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { auth } from '@/composition/auth';
import { PAGE_SETTINGS_SPECS } from '@/composition/page-settings/specs';
import { SettingsControlRow } from '../settings-control-row';
import { SettingsSectionHead } from '../settings-section-head';
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

async function PreferencesContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/?auth_error=login_required');
  }

  const groups = derivePreferenceGroups(PAGE_SETTINGS_SPECS);

  return (
    <>
      {groups.length === 0 ? (
        <Card>
          <EmptyState>Nothing to configure yet.</EmptyState>
        </Card>
      ) : (
        groups.map((group) => <PreferenceGroupCard key={group.id} group={group} />)
      )}
      <p className="text-ui leading-relaxed text-muted">
        These preferences are saved on this device. Each page also offers its own settings in the
        account menu while you are on it.
      </p>
    </>
  );
}

export default function PreferencesSettingsPage() {
  return (
    <>
      <SettingsSectionHead
        title="Preferences"
        description="Per-page display settings, gathered in one place"
      />
      <Suspense
        fallback={<Skeleton label="Loading preferences" className="h-40 w-full rounded-card" />}
      >
        <PreferencesContent />
      </Suspense>
    </>
  );
}
