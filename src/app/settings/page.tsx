import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionHeader } from '@/components/ui/section-header';
import { getCorpStructuresPageData } from '@/composition/sync/corp-structures-sync';
import { auth } from '@/platform/auth/auth';
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

// The account-wide settings page (ACCOUNT.6), reached from the portrait menu.
// Registry-rendered (D-8): the junction-owned '/settings' spec resolves through
// the same presentation path as the menu, so lighting up an account-wide
// preference is one spec ref — the page carries no per-setting code. Feature
// controls resolve by id through an exhaustive switch (in settings-view.ts, so a
// new id fails tsc until it is mapped); their data is fetched here in app land so
// nothing server-only leaks into the junction's client-imported graph.

// The settings-page sections, rendered from the derived view. The render guards
// live here so the request-time content shell stays a thin, branch-light hole.
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

// Session-gated: the whole content is a request-time dynamic hole (the
// /characters idiom); the page container prerenders as the static shell.
// getCorpStructuresPageData is the same read /structures uses — the
// Station_Manager flags come from the identical code path, and viewing this
// page dispatches the same stale-gated on-view refresh.
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
    <>
      <div className="w-full max-w-[760px]">
        <PageHead
          crumb="settings"
          title="Account settings"
          subtitle="Account-wide settings — they apply to every character on this account"
        />
      </div>

      <div className="w-full max-w-[760px] flex flex-col gap-6">
        <SettingsSections view={view} />
      </div>
    </>
  );
}

/**
 * Renders the /settings route surface and owns its page-level composition, metadata boundary, and
 * fallback presentation.
 */
export default function SettingsPage() {
  return (
    <PageShell>
      <div className="flex flex-col items-center gap-0 pb-20">
        <Suspense fallback={<LoadingLabel />}>
          <SettingsContent />
        </Suspense>
      </div>
    </PageShell>
  );
}
