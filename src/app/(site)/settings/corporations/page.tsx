import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { requireSessionPage } from '@/composition/route-guards';
import { getCorpStructuresPageData } from '@/composition/sync/corp-structures-sync';
import { accountPageSettings } from '@/platform/page-settings/account';
import { resolvePageControls } from '@/platform/page-settings/controls';
import { QuietSectionHead } from '@/components/ui/section-head';
import { CorporationsLive } from './corporations-live';
import { settingsNeedsCorpSharing } from './corporations-view';

async function CorporationsContent() {
  const session = await requireSessionPage();

  const models = resolvePageControls(accountPageSettings);
  const rows = settingsNeedsCorpSharing(models)
    ? (await getCorpStructuresPageData(session.user.id)).corporations
    : [];

  return <CorporationsLive initial={rows} />;
}

export default function CorporationsSettingsPage() {
  return (
    <>
      <QuietSectionHead title="Corporations" />
      <Suspense
        fallback={<Skeleton label="Loading corporations" className="h-40 w-full rounded-card" />}
      >
        <CorporationsContent />
      </Suspense>
    </>
  );
}
