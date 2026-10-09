import { Suspense } from 'react';
import { Banner } from '@/components/ui/banner';
import { AdminPageFrame } from '../AdminFrame';
import { AdminSection } from '../AdminSection';
import { getStaticsReviewShared } from '../shared-reads';
import { loadServingCopy, PendingReview, ServingCopy, StaticsActionForm } from './StaticsCards';
import { outcomeMessage } from './statics-view';

type StaticsSearchParams = Promise<{ outcome?: string | string[] }>;

async function OutcomeBanner({ searchParams }: { searchParams: StaticsSearchParams }) {
  const outcome = outcomeMessage((await searchParams).outcome);
  return outcome ? <Banner tone="info">{outcome}</Banner> : null;
}

// Each card reads on its own, so a failed review read leaves the serving copy.
export default function StaticsPage({ searchParams }: { searchParams: StaticsSearchParams }) {
  return (
    <AdminPageFrame
      title="Wormhole statics"
      actions={<StaticsActionForm action="refresh" label="Check feed now" />}
      fallbackLabel="Serving copy"
    >
      <Suspense fallback={null}>
        <OutcomeBanner searchParams={searchParams} />
      </Suspense>
      <AdminSection title="Serving copy" name="serving-copy" rows={1} reveal={1} load={loadServingCopy}>
        {(copy) => <ServingCopy copy={copy} />}
      </AdminSection>
      <AdminSection
        title="Pending review"
        name="pending-review"
        rows={4}
        reveal={2}
        hint={(snapshot) => (snapshot ? `Feed v${snapshot.feedVersion}` : undefined)}
        load={getStaticsReviewShared}
      >
        {(snapshot) => <PendingReview snapshot={snapshot} />}
      </AdminSection>
    </AdminPageFrame>
  );
}
