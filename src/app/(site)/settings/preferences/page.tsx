import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { getFullSession } from '@/composition/session';
import { PAGE_SETTINGS_SPECS } from '@/composition/page-settings/specs';
import { SectionHead } from '@/components/ui/section-head';
import { PreferenceGroups } from './preference-groups';

async function PreferencesContent() {
  const session = await getFullSession();
  if (!session) {
    redirect('/?auth_error=login_required');
  }

  return (
    <>
      <PreferenceGroups specs={PAGE_SETTINGS_SPECS} />
      <p className="text-ui leading-relaxed text-muted">
        Saved on this device.
      </p>
    </>
  );
}

export default function PreferencesSettingsPage() {
  return (
    <>
      <SectionHead title="Preferences" />
      <Suspense
        fallback={<Skeleton label="Loading preferences" className="h-40 w-full rounded-card" />}
      >
        <PreferencesContent />
      </Suspense>
    </>
  );
}
