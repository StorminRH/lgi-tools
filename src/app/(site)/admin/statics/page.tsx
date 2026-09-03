import Link from 'next/link';
import { Suspense } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Collapsible } from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { getWhStaticsOperatorReview } from '@/composition/wh-statics-refresh';
import {
  getSystemStatics,
  type PendingWhStaticsReview,
} from '@/data/wh-statics/queries';
import type { WhStaticsSystemCodes } from '@/data/wh-statics/schema';
import { requireAdminPage } from '@/composition/route-guards';

const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  busy: 'Another statics refresh is already running.',
  'feed-unavailable': 'The community feed was unavailable; the promoted copy was not changed.',
  promoted: 'The pending statics snapshot was promoted.',
  rejected: 'The pending statics snapshot was rejected.',
  'snapshot-pending': 'A changed feed was recorded for review.',
  'stale-observation':
    'A newer feed observation was already recorded; the pending snapshot was left alone.',
  unchanged: 'The community feed is unchanged.',
};

function outcomeMessage(raw: string | string[] | undefined): string | undefined {
  return typeof raw === 'string' ? OUTCOME_LABELS[raw] : undefined;
}

function promotedSubtitle(
  version: string,
  systemCount: number,
): string {
  if (version === '') {
    return 'No snapshot is promoted yet. Review the community refresh before it reaches serving.';
  }
  return `Serving feed v${version} across ${systemCount.toLocaleString()} systems.`;
}

function ActionForm({
  action,
  snapshotId,
  label,
  variant = 'secondary',
  disabled = false,
}: {
  action: 'promote' | 'reject' | 'refresh';
  snapshotId?: number;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  return (
    <form action="/api/admin/wh-statics" method="post">
      <input type="hidden" name="action" value={action} />
      {snapshotId === undefined ? null : (
        <input type="hidden" name="snapshotId" value={snapshotId} />
      )}
      <Button type="submit" variant={variant} disabled={disabled}>
        {label}
      </Button>
    </form>
  );
}

function NumberList({ values }: { values: readonly number[] }) {
  return values.length === 0 ? (
    <p className="font-ui text-ui text-muted">None.</p>
  ) : (
    <ul className="max-h-64 space-y-1 overflow-y-auto font-data text-ui text-text">
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

function SystemCodeList({
  systems,
}: {
  systems: readonly WhStaticsSystemCodes[];
}) {
  return systems.length === 0 ? (
    <p className="font-ui text-ui text-muted">None.</p>
  ) : (
    <ul className="max-h-64 space-y-1 overflow-y-auto font-data text-ui text-text">
      {systems.map((system) => (
        <li key={system.systemId}>
          {system.systemId}: {system.codes.join(', ') || 'none'}
        </li>
      ))}
    </ul>
  );
}

function DifferenceDetails({
  snapshot,
}: {
  snapshot: PendingWhStaticsReview;
}) {
  const { difference } = snapshot;
  return (
    <Collapsible
      defaultOpen
      header={
        <span className="font-ui text-ui text-text">
          Complete assignment difference ({difference.totalDifferences})
        </span>
      }
    >
      <div className="grid gap-5 px-4 py-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 font-ui text-ui text-muted">
            Systems added, with the codes they gain
          </h3>
          <SystemCodeList systems={difference.systemsAdded} />
        </div>
        <div>
          <h3 className="mb-2 font-ui text-ui text-muted">
            Systems removed, with the codes they lose
          </h3>
          <SystemCodeList systems={difference.systemsRemoved} />
        </div>
        <div className="md:col-span-2">
          <h3 className="mb-2 font-ui text-ui text-muted">Systems changed</h3>
          {difference.systemsChanged.length === 0 ? (
            <p className="font-ui text-ui text-muted">None.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto font-data text-ui text-text">
              {difference.systemsChanged.map((entry) => (
                <li key={entry.systemId}>
                  {entry.systemId}: {entry.before.join(', ') || 'none'} →{' '}
                  {entry.after.join(', ') || 'none'}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 font-ui text-ui text-muted">Codes added</h3>
          <p className="font-data text-ui text-text">
            {difference.codesAdded.join(', ') || 'None.'}
          </p>
        </div>
        <div>
          <h3 className="mb-2 font-ui text-ui text-muted">Codes removed</h3>
          <p className="font-data text-ui text-text">
            {difference.codesRemoved.join(', ') || 'None.'}
          </p>
        </div>
      </div>
    </Collapsible>
  );
}

function LineageDetails({
  snapshot,
}: {
  snapshot: PendingWhStaticsReview;
}) {
  const { crossCheck } = snapshot;
  return (
    <Collapsible
      defaultOpen
      header={
        <span className="font-ui text-ui text-text">
          Complete lineage comparison (
          {crossCheck.disagreements.length +
            crossCheck.lineageOnlySystems.length +
            crossCheck.feedOnlySystems.length}{' '}
          structural differences)
        </span>
      }
    >
      <div className="grid gap-5 px-4 py-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 font-ui text-ui text-muted">
            Lineage-only systems
          </h3>
          <NumberList values={crossCheck.lineageOnlySystems} />
        </div>
        <div>
          <h3 className="mb-2 font-ui text-ui text-muted">
            Feed-only systems
          </h3>
          <NumberList values={crossCheck.feedOnlySystems} />
        </div>
        <div className="md:col-span-2">
          <h3 className="mb-2 font-ui text-ui text-muted">
            Code-set disagreements
          </h3>
          {crossCheck.disagreements.length === 0 ? (
            <p className="font-ui text-ui text-muted">None.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto font-data text-ui text-text">
              {crossCheck.disagreements.map((entry) => (
                <li key={entry.systemId}>
                  {entry.systemId}: feed {entry.feedCodes.join(', ') || 'none'};
                  lineage {entry.lineageCodes.join(', ') || 'none'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Collapsible>
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
      <p className="border-t border-border-soft px-4 py-3 font-ui text-ui text-muted">
        Independent lineage agrees across{' '}
        {crossCheck.agreedSystems.toLocaleString()} systems. Inspect every
        structural difference before promoting.
      </p>
      <DifferenceDetails snapshot={snapshot} />
      <LineageDetails snapshot={snapshot} />
      <div className="flex flex-wrap gap-2 border-t border-border-soft px-4 py-3">
        <ActionForm
          action="promote"
          snapshotId={snapshot.id}
          label={
            snapshot.systemCount === 0
              ? 'Empty snapshot cannot be promoted'
              : 'Promote snapshot'
          }
          variant="primary"
          disabled={snapshot.systemCount === 0}
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
  const [snapshot, promoted, raw] = await Promise.all([
    getWhStaticsOperatorReview(),
    getSystemStatics(),
    searchParams,
  ]);
  const outcome = outcomeMessage(raw.outcome);

  return (
    <>
      <div className="w-full space-y-5">
        <Card className="px-4 py-3 font-ui text-ui text-muted">
          {promotedSubtitle(promoted.version, promoted.systems.length)}
        </Card>
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
        <PageHead
          size="compact"
          crumb="admin / statics"
          title="Wormhole statics"
          subtitle="Review the complete community-feed difference before changing the promoted serving copy."
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
        <Suspense
          fallback={
            <Skeleton
              label="Loading statics review"
              className="h-72 w-full"
            />
          }
        >
          <StaticsContent searchParams={searchParams} />
        </Suspense>
      </div>
    </PageShell>
  );
}
