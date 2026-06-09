import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { loginFrequencyBuckets } from '@/data/telemetry/health-metrics';
import { getLoginCountsPerUser } from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { AdminBarChart } from './charts';

// Aggregate-only user engagement — counts, never identities. The new-vs-
// returning split lives on the KPI row; this card answers "how often do the
// people who sign in come back?". Role management + audit live on /admin/access.

export async function UsersSection({ range }: { range: DateRange }) {
  const loginCounts = await getLoginCountsPerUser(range);
  const buckets = loginFrequencyBuckets(loginCounts);

  return (
    <Card>
      <SectionHeader
        size="md"
        label="Visit frequency"
        hint={`${loginCounts.length} signed-in user${loginCounts.length === 1 ? '' : 's'}`}
      />
      {loginCounts.length === 0 ? (
        <EmptyState>No sign-ins in this range.</EmptyState>
      ) : (
        <div className="px-3.5 py-3">
          <div className="text-[10px] tracking-[0.16em] uppercase text-muted mb-2">
            Users by login count
          </div>
          <AdminBarChart
            data={buckets.map((b) => ({ label: b.label, value: b.users }))}
            ariaLabel="Users by login count"
          />
        </div>
      )}
      <div className="px-3.5 py-2 border-t border-border-soft font-mono text-[11px] text-muted">
        Admin roles and the role-change audit live on{' '}
        <a href="/admin/access" className="text-isk hover:text-name transition-colors">
          Access →
        </a>
      </div>
    </Card>
  );
}
