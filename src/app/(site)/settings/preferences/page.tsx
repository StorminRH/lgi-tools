import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getFullSession } from '@/composition/session';
import { PAGE_SETTINGS_SPECS } from '@/composition/page-settings/specs';
import { QuietSectionHead } from '@/components/ui/section-head';
import { PreferenceGroups } from './preference-groups';

/** Sends a signed-out visitor home. The controls need nothing from the request, so they prerender. */
async function RequireSession() {
  const session = await getFullSession();
  if (!session) {
    redirect('/?auth_error=login_required');
  }
  return null;
}

export default function PreferencesSettingsPage() {
  return (
    <>
      <QuietSectionHead title="Preferences" />
      <Suspense fallback={null}>
        <RequireSession />
      </Suspense>
      <PreferenceGroups specs={PAGE_SETTINGS_SPECS} />
      <p className="text-ui leading-relaxed text-muted">
        Saved on this device.
      </p>
    </>
  );
}
