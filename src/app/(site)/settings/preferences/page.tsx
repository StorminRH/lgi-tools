import { Suspense } from 'react';
import { requireSessionPage } from '@/composition/route-guards';
import { PAGE_SETTINGS_SPECS } from '@/composition/page-settings/specs';
import { QuietSectionHead } from '@/components/ui/section-head';
import { PreferenceGroups } from './preference-groups';

/** Sends a signed-out visitor home. The controls need nothing from the request, so they prerender. */
async function RequireSession() {
  await requireSessionPage();
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
