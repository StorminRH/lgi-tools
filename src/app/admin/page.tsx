import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SegmentedControl } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { formatIsoDay } from '@/lib/format/time';
import { getSession, isAdmin } from '@/platform/auth/session';
import { MetricsSection } from './MetricsSection';
import { OpsSection } from './OpsSection';
import { parseRange, RANGES, rangeFor, type RangeKey } from './period';
import { PrintButton } from './PrintButton';
import { StatusStrip } from './StatusStrip';
import { TrafficSection } from './TrafficSection';
import { UsersSection } from './UsersSection';

// The owner's single-page dashboard: headline KPIs with period-over-period
// deltas, an is-anything-broken status strip, traffic & SEO, and user
// engagement — every metric exactly once, no tabs. Role management lives on
// /admin/access. Charts stay on one blue accent; green/amber/red are reserved
// for status dots and KPI deltas.

function RangeSelector({ range }: { range: RangeKey }) {
  return (
    <SegmentedControl
      className="no-print"
      label="Reporting range"
      value={range}
      options={RANGES.map((option) => ({
        value: option,
        label: option === 'all' ? 'All' : option,
        href: `/admin?range=${option}`,
      }))}
    />
  );
}

function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-mono text-label font-semibold tracking-[0.2em] uppercase text-muted mb-2">
      {children}
    </h2>
  );
}

function SectionFallback() {
  return (
    <div className="rounded-card border border-border bg-section shadow-card-edge">
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-3 last:border-b-0"
        >
          <Skeleton className={row === 1 ? 'h-3 w-3/5' : 'h-3 w-2/5'} />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

async function AdminContent({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const session = await getSession();
  if (!isAdmin(session)) {
    redirect('/?auth_error=admin_required');
  }

  const raw = await searchParams;
  const rangeKey = parseRange(raw.range);
  const range = rangeFor(rangeKey);

  return (
    <>
      <div className="print-only font-mono text-label tracking-wide uppercase text-muted mb-1">
        Admin report — {formatIsoDay(range.from)} to {formatIsoDay(range.to)}
      </div>
      <PageHead
        crumb="admin"
        title="Admin"
        subtitle={`${formatIsoDay(range.from)} → ${formatIsoDay(range.to)}`}
        meta={
          <div className="flex items-center gap-3">
            <RangeSelector range={rangeKey} />
            <Link
              href="/admin/access"
              className={cn(buttonVariants({ variant: 'secondary' }), 'no-print text-muted hover:text-text')}
            >
              Access →
            </Link>
            <PrintButton />
          </div>
        }
      />

      <div className="w-full flex flex-col gap-8">
        <Suspense fallback={<SectionFallback />}>
          <MetricsSection rangeKey={rangeKey} range={range} />
        </Suspense>

        <section>
          <GroupHeading>System health</GroupHeading>
          <Suspense fallback={<SectionFallback />}>
            <StatusStrip range={range} />
          </Suspense>
        </section>

        <section>
          <GroupHeading>ESI &amp; ops</GroupHeading>
          <Suspense fallback={<SectionFallback />}>
            <OpsSection rangeKey={rangeKey} range={range} />
          </Suspense>
        </section>

        <section>
          <GroupHeading>Traffic &amp; SEO</GroupHeading>
          <Suspense fallback={<SectionFallback />}>
            <TrafficSection rangeKey={rangeKey} range={range} />
          </Suspense>
        </section>

        <section>
          <GroupHeading>Users</GroupHeading>
          <Suspense fallback={<SectionFallback />}>
            <UsersSection range={range} />
          </Suspense>
        </section>
      </div>
    </>
  );
}

function AdminLoading() {
  return (
    <LoadingLabel />
  );
}

/**
 * Per-user, session-gated: the content (auth check, redirect, DB reads) is a
 * fully request-time dynamic hole. Only the page container prerenders.
 */
export default function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  return (
    <PageShell>
      <div className="flex flex-col items-center pb-20 gap-0">
        <Suspense fallback={<AdminLoading />}>
          <AdminContent searchParams={searchParams} />
        </Suspense>
      </div>
    </PageShell>
  );
}
