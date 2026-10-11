import { ActionForm } from '@/components/ui/action-form';
import { cn } from '@/components/ui/cn';
import { Collapsible } from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/empty-state';
import { MultiplesCell, MultiplesGrid } from '@/components/ui/multiples-grid';
import { getSystemStatics, type PendingWhStaticsReview } from '@/data/wh-statics/queries';
import { formatCount, formatQuantity } from '@/lib/format/number';
import {
  differenceLists,
  lineageDifferenceCount,
  lineageLists,
  reviewFigures,
  type ReviewList,
} from './statics-view';

export function StaticsActionForm({
  action,
  snapshotId,
  label,
  variant,
  disabled,
}: {
  action: 'promote' | 'reject' | 'refresh';
  snapshotId?: number;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  return (
    <ActionForm
      action="/api/admin/wh-statics"
      fields={{ action, snapshotId }}
      variant={variant}
      size="md"
      disabled={disabled}
    >
      {label}
    </ActionForm>
  );
}

/** The promoted copy's version and size; the systems themselves stay on the server. */
export async function loadServingCopy() {
  const promoted = await getSystemStatics();
  return { version: promoted.version, systemCount: promoted.systems.length };
}

export function ServingCopy({ copy }: { copy: Awaited<ReturnType<typeof loadServingCopy>> }) {
  if (copy.version === '') return <EmptyState>No promoted snapshot.</EmptyState>;
  return (
    <p className="px-3.5 py-2.5 font-ui text-ui text-muted">
      v{copy.version} · {formatCount(copy.systemCount, 'system')}
    </p>
  );
}

function ReviewListItems({ list }: { list: ReviewList }) {
  if (list.items.length === 0) return <EmptyState inset>None.</EmptyState>;
  if (list.inline) return <p className="font-data text-ui text-text wrap-break-word">{list.items.join(', ')}</p>;
  return (
    <ul className={cn('space-y-1 overflow-y-auto font-data text-ui text-text', list.wide ? 'max-h-80' : 'max-h-64')}>
      {list.items.map((item) => (
        <li key={item} className="wrap-break-word">
          {item}
        </li>
      ))}
    </ul>
  );
}

function ReviewPanel({ summary, lists }: { summary: string; lists: ReviewList[] }) {
  return (
    <Collapsible defaultOpen chevron header={<span className="font-ui text-ui text-text">{summary}</span>}>
      <div className="grid gap-5 px-3.5 py-3 md:grid-cols-2">
        {lists.map((list) => (
          <div key={list.title} className={list.wide ? 'md:col-span-2' : undefined}>
            <h4 className="mb-2 font-ui text-ui text-muted">{list.title}</h4>
            <ReviewListItems list={list} />
          </div>
        ))}
      </div>
    </Collapsible>
  );
}

export function PendingReview({ snapshot }: { snapshot: PendingWhStaticsReview | null }) {
  if (snapshot === null) return <EmptyState>No pending snapshot.</EmptyState>;
  const agreed = snapshot.crossCheck.agreedSystems;
  return (
    <>
      <MultiplesGrid columns={4}>
        {reviewFigures(snapshot).map((figure) => (
          <MultiplesCell key={figure.title} title={figure.title} value={formatQuantity(figure.value)} />
        ))}
      </MultiplesGrid>
      <p className="border-y border-border-soft px-3.5 py-2.5 font-ui text-ui text-muted">
        {formatCount(agreed, 'system')} {agreed === 1 ? 'matches' : 'match'} independent lineage.
      </p>
      <ReviewPanel
        summary={`Systems with assignment changes (${formatQuantity(snapshot.difference.totalDifferences)})`}
        lists={differenceLists(snapshot)}
      />
      <ReviewPanel
        summary={`Complete lineage comparison (${formatCount(lineageDifferenceCount(snapshot), 'structural difference')})`}
        lists={lineageLists(snapshot)}
      />
      <div className="flex flex-wrap gap-2 px-3.5 py-3">
        <StaticsActionForm
          action="promote"
          snapshotId={snapshot.id}
          label={snapshot.systemCount === 0 ? 'Empty snapshot cannot be promoted' : 'Promote snapshot'}
          variant="primary"
          disabled={snapshot.systemCount === 0}
        />
        <StaticsActionForm action="reject" snapshotId={snapshot.id} label="Reject snapshot" variant="danger" />
      </div>
    </>
  );
}
