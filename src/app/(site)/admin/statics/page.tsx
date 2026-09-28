import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible } from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import {
  getSystemStatics,
  type PendingWhStaticsReview,
} from '@/data/wh-statics/queries';
import type { WhStaticsSystemCodes } from '@/data/wh-statics/schema';
import { AdminPageFrame } from '../AdminFrame';
import { getStaticsReviewShared } from '../statics-review-shared';

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
          Systems with assignment changes ({difference.totalDifferences})
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
          <h3 className="mb-2 font-ui text-ui text-muted">New code types</h3>
          <p className="font-data text-ui text-text">
            {difference.codesAdded.join(', ') || 'None.'}
          </p>
        </div>
        <div>
          <h3 className="mb-2 font-ui text-ui text-muted">Removed code types</h3>
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
      <SectionHeader size="md" label={`Pending feed v${snapshot.feedVersion}`} />
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

function ServingStatus({ version, systemCount }: { version: string; systemCount: number }) {
  return (
    <Card>
      <SectionHeader size="md" label="Serving copy" />
      <p className="px-4 py-3 font-ui text-ui text-muted">{promotedSubtitle(version, systemCount)}</p>
    </Card>
  );
}

async function StaticsContent({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string | string[] }>;
}) {
  const [snapshot, promoted, raw] = await Promise.all([
    getStaticsReviewShared(),
    getSystemStatics(),
    searchParams,
  ]);
  const outcome = outcomeMessage(raw.outcome);

  return (
    <div className="reveal reveal-1 flex w-full flex-col gap-4">
      {outcome ? <Banner tone="info">{outcome}</Banner> : null}
      <ServingStatus version={promoted.version} systemCount={promoted.systems.length} />
      {snapshot ? (
        <ReviewSummary snapshot={snapshot} />
      ) : (
        <Card>
          <SectionHeader size="md" label="Pending review" />
          <EmptyState>
            No statics snapshot is waiting for review. The daily check records one when the
            community feed changes; use Check feed now to look immediately.
          </EmptyState>
        </Card>
      )}
    </div>
  );
}

export default function StaticsPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string | string[] }>;
}) {
  return (
    <AdminPageFrame
      title="Wormhole statics"
      actions={<ActionForm action="refresh" label="Check feed now" />}
      fallbackLabel="Serving copy"
    >
      <StaticsContent searchParams={searchParams} />
    </AdminPageFrame>
  );
}
