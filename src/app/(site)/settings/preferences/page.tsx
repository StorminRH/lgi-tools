import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { auth } from '@/composition/auth';
import { PAGE_SETTINGS_SPECS } from '@/composition/page-settings/specs';
import { SettingsSectionHead } from '../settings-section-head';
import { PreferenceGroups } from './preference-groups';

async function PreferencesContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/?auth_error=login_required');
  }

  return (
    <>
      <PreferenceGroups specs={PAGE_SETTINGS_SPECS} />
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
