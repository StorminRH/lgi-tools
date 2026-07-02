import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionHeader } from '@/components/ui/section-header';
import { getCorpStructuresPageData } from '@/db/corp-structures-sync';
import { auth } from '@/features/auth/auth';
import {
  CorpSharingSettings,
  type SharingCorpView,
} from '@/features/owned-structures/components/CorpSharingSettings';
import { accountPageSettings } from '@/page-settings/account';
import {
  resolvePageControls,
  type FeatureControlModel,
  type MenuControlModel,
} from '@/page-settings/controls';
import { SettingsControlRow } from './settings-control-row';

// The account-wide settings page (ACCOUNT.6), reached from the portrait menu.
// Registry-rendered (D-8): the junction-owned '/settings' spec resolves through
// the same presentation path as the menu, so lighting up an account-wide
// preference is one spec ref — the page carries no per-setting code. Feature
// controls resolve by id to the exhaustive switch below (a new id fails tsc
// until it is mapped); their data is fetched here in app land so nothing
// server-only leaks into the junction's client-imported graph.

// The feature control's section, or null when the viewer has nothing to
// configure (fail-closed: a non-Station_Manager sees no sharing section at
// all, never a disabled tease).
function featureControlSection(
  model: FeatureControlModel,
  managerCorps: SharingCorpView[],
): ReactNode | null {
  switch (model.id) {
    case 'corp-structure-sharing':
      return managerCorps.length > 0 ? (
        <CorpSharingSettings key={model.id} corps={managerCorps} />
      ) : null;
    default: {
      const unmapped: never = model.id;
      return unmapped;
    }
  }
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
  const needsCorpSharing = models.some(
    (m) => m.kind === 'feature' && m.id === 'corp-structure-sharing',
  );
  const managerCorps: SharingCorpView[] = needsCorpSharing
    ? (await getCorpStructuresPageData(session.user.id))
        .filter((corp) => corp.isStationManager)
        .map((corp) => ({
          corporationId: corp.corporationId,
          corporationName: corp.corporationName,
          sharingEnabled: corp.sharingEnabled,
        }))
    : [];

  const preferenceModels = models.filter((m): m is MenuControlModel => m.kind === 'preference');
  const featureSections = models
    .filter((m): m is FeatureControlModel => m.kind === 'feature')
    .map((m) => featureControlSection(m, managerCorps))
    .filter((section) => section !== null);

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
        {preferenceModels.length > 0 ? (
          <Card>
            <SectionHeader size="md" label="Preferences" />
            <div className="flex flex-col gap-3 px-3.5 py-3.5">
              {preferenceModels.map((model) => (
                <SettingsControlRow key={model.key} model={model} />
              ))}
            </div>
          </Card>
        ) : null}

        {featureSections}

        {preferenceModels.length === 0 && featureSections.length === 0 ? (
          <EmptyState>Nothing to configure yet.</EmptyState>
        ) : null}
      </div>
    </>
  );
}

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
