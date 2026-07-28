import Link from 'next/link';
import { Suspense } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionHeader } from '@/components/ui/section-header';
import {
  getPendingWhStaticsReview,
  type PendingWhStaticsReview,
} from '@/data/wh-statics/queries';
import { db } from '@/db';
import { requireAdminPage } from '@/platform/auth/route-guards';

const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  busy: 'Another statics refresh is already running.',
  'feed-unavailable': 'The community feed was unavailable; the promoted copy was not changed.',
  promoted: 'The pending statics snapshot was promoted.',
  rejected: 'The pending statics snapshot was rejected.',
  'snapshot-pending': 'A changed feed was recorded for review.',
  unchanged: 'The community feed is unchanged.',
};

function ActionForm({
  action,
  snapshotId,
  label,
  variant = 'secondary',
}: {
  action: 'promote' | 'reject' | 'refresh';
  snapshotId?: number;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <form action="/api/admin/wh-statics" method="post">
      <input type="hidden" name="action" value={action} />
      {snapshotId === undefined ? null : (
        <input type="hidden" name="snapshotId" value={snapshotId} />
      )}
      <Button type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

function ReviewSummary({ snapshot }: { snapshot: PendingWhStaticsReview }) {
  const { difference, crossCheck } = snapshot;
  return (
    <Card>
      <SectionHeader
        size="md"
        label={`Pending feed v${snapshot.feedVersion}`}
        hint={`${snapshot.systemCount.toLocaleString()} systems`}
      />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-4 font-data text-ui md:grid-cols-4">
        <div>
          <dt className="text-muted">Systems added</dt>
          <dd className="text-text">{difference.systemsAdded.length}</dd>
        </div>
        <div>
          <dt className="text-muted">Systems removed</dt>
          <dd className="text-text">{difference.systemsRemoved.length}</dd>
        </div>
        <div>
          <dt className="text-muted">Systems changed</dt>
          <dd className="text-text">{difference.systemsChanged.length}</dd>
        </div>
        <div>
          <dt className="text-muted">Lineage disagreements</dt>
          <dd className="text-text">{crossCheck.disagreements.length}</dd>
        </div>
      </dl>
      {crossCheck.disagreements.length === 0 ? (
        <p className="border-t border-border-soft px-4 py-3 font-ui text-ui text-muted">
          Independent lineage agrees across {crossCheck.agreedSystems.toLocaleString()} systems.
        </p>
      ) : (
        <div className="border-t border-border-soft px-4 py-3">
          <p className="mb-2 font-ui text-ui text-muted">
            Review every disagreement before promoting:
          </p>
          <ul className="space-y-1 font-data text-ui text-text">
            {crossCheck.disagreements.map((entry) => (
              <li key={entry.systemId}>
                {entry.systemId}: feed {entry.feedCodes.join(', ') || 'none'}; lineage{' '}
                {entry.lineageCodes.join(', ') || 'none'}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border-soft px-4 py-3">
        <ActionForm
          action="promote"
          snapshotId={snapshot.id}
          label="Promote snapshot"
          variant="primary"
        />
        <ActionForm
          action="reject"
          snapshotId={snapshot.id}
          label="Reject snapshot"
          variant="danger"
        />
      </div>
    </Card>
  );
}

async function StaticsContent({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string | string[] }>;
}) {
  await requireAdminPage();
  const [snapshot, raw] = await Promise.all([
    getPendingWhStaticsReview(db),
    searchParams,
  ]);
  const outcome =
    typeof raw.outcome === 'string' ? OUTCOME_LABELS[raw.outcome] : undefined;

  return (
    <>
      <PageHead
        size="compact"
        crumb="admin / statics"
        title="Wormhole statics"
        subtitle="Review the community refresh before it reaches serving."
        meta={
          <Link
            href="/admin"
            className={cn(
              buttonVariants({ variant: 'secondary' }),
              'text-muted hover:text-text',
            )}
          >
            ← Dashboard
          </Link>
        }
      />
      <div className="w-full space-y-5">
        {outcome ? (
          <Card className="px-4 py-3 font-ui text-ui text-muted">{outcome}</Card>
        ) : null}
        <div className="flex justify-end">
          <ActionForm action="refresh" label="Check feed now" />
        </div>
        {snapshot ? (
          <ReviewSummary snapshot={snapshot} />
        ) : (
          <Card>
            <SectionHeader size="md" label="Pending review" />
            <EmptyState>No statics snapshot is waiting for review.</EmptyState>
          </Card>
        )}
      </div>
    </>
  );
}

/**
 * Admin-gated operator review screen with a prerendered shell and request-time
 * auth and database work isolated in one Suspense hole.
 */
export default function StaticsPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string | string[] }>;
}) {
  return (
    <PageShell mode="workspace">
      <div className="flex flex-col items-center gap-0 pb-20">
        <Suspense fallback={<LoadingLabel />}>
          <StaticsContent searchParams={searchParams} />
        </Suspense>
      </div>
    </PageShell>
  );
}
