import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { getCorpStructuresPageData } from '@/composition/sync/corp-structures-sync';
import { auth } from '@/composition/auth';
import {
  CorpSharingSettings,
  type SharingCorpView,
} from '@/features/owned-structures/components/CorpSharingSettings';
import { accountPageSettings } from '@/platform/page-settings/account';
import { resolvePageControls } from '@/platform/page-settings/controls';
import { SettingsControlRow } from './settings-control-row';
import {
  deriveSettingsView,
  settingsNeedsCorpSharing,
  toManagerCorps,
  type SettingsView,
} from './settings-view';

function SettingsSections({ view }: { view: SettingsView }) {
  return (
    <>
      {view.preferenceModels.length > 0 ? (
        <Card>
          <SectionHeader size="md" label="Preferences" />
          <div className="flex flex-col gap-3 px-3.5 py-3.5">
            {view.preferenceModels.map((model) => (
              <SettingsControlRow key={model.key} model={model} />
            ))}
          </div>
        </Card>
      ) : null}

      {view.featureSections.map((section) => (
        <CorpSharingSettings key={section.id} corps={section.corps} />
      ))}

      {view.isEmpty ? (
        <EmptyState>Nothing to configure yet.</EmptyState>
      ) : null}
    </>
  );
}

async function SettingsContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/?auth_error=login_required');
  }

  const models = resolvePageControls(accountPageSettings);
  const managerCorps: SharingCorpView[] = settingsNeedsCorpSharing(models)
    ? toManagerCorps(await getCorpStructuresPageData(session.user.id))
    : [];
  const view = deriveSettingsView(models, managerCorps);

  return (
    <div className="flex w-full flex-col gap-6">
      <SettingsSections view={view} />
    </div>
  );
}

function SettingsLoading() {
  return (
    <div className="flex w-full flex-col gap-6">
      <Skeleton label="Loading account settings" className="h-40 w-full rounded-card" />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <PageShell mode="reading">
      <div className="flex flex-col items-center gap-0 pb-20">
        <PageHead
          crumb="settings"
          title="Account settings"
          subtitle="Account-wide settings — they apply to every character on this account"
        />
        <Suspense fallback={<SettingsLoading />}>
          <SettingsContent />
        </Suspense>
      </div>
    </PageShell>
  );
}
