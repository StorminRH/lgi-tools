import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { DistributionBars } from '@/components/ui/distribution-bars';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { StackedShareBar } from '@/components/ui/stacked-share-bar';
import { loginFrequencyBuckets } from '@/data/telemetry/health-metrics';
import { getLoginCountsPerUser, getReturningVsNew } from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { SectionUnavailable } from './SectionUnavailable';

// Aggregate-only user engagement — counts, never identities. The new-vs-
// returning split (once a KPI sub) is now a labelled share bar; below it, "how
// often do the people who sign in come back?" as a horizontal distribution.
// Role management + audit live on /admin/access.

function pluralUsers(n: number): string {
  return `${n.toLocaleString()} user${n === 1 ? '' : 's'}`;
}

/**
 * Renders the users section surface; this component owns local presentation and interaction wiring
 * while callers own domain data.
 */
export async function UsersSection({ range }: { range: DateRange }) {
  const fetched = await loadSection('users', () =>
    Promise.all([getLoginCountsPerUser(range), getReturningVsNew(range)]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Visit frequency" />;

  const [loginCounts, returningVsNew] = fetched;
  const buckets = loginFrequencyBuckets(loginCounts);
  const totalUsers = returningVsNew.newUsers + returningVsNew.returning;

  return (
    <Card>
      <SectionHeader
        size="md"
        label="Visit frequency"
        hint={`${pluralUsers(loginCounts.length)} signed in`}
      />
      {totalUsers > 0 && (
        <div className="px-3.5 py-3 border-b border-border-soft">
          <div className="text-label tracking-display uppercase text-muted mb-2">
            New vs returning
          </div>
          <StackedShareBar
            segments={[
              { label: 'New', value: returningVsNew.newUsers, tone: 'blue' },
              { label: 'Returning', value: returningVsNew.returning, tone: 'neutral' },
            ]}
            ariaLabel="New versus returning signed-in users"
          />
        </div>
      )}
      {loginCounts.length === 0 ? (
        <EmptyState>No sign-ins in this range.</EmptyState>
      ) : (
        <div className="pt-1">
          <div className="px-3.5 py-2 text-label tracking-display uppercase text-muted">
            Users by login count
          </div>
          <DistributionBars
            rows={buckets.map((b) => ({ key: b.label, label: b.label, count: b.users }))}
            formatCount={pluralUsers}
            sort="none"
            ariaLabel="Users by login count"
          />
        </div>
      )}
      <div className="px-3.5 py-2 border-t border-border-soft font-mono text-ui text-muted">
        Admin roles and the role-change audit live on{' '}
        <Link href="/admin/access" className="text-isk hover:text-name transition-colors">
          Access →
        </Link>
      </div>
    </Card>
  );
}
