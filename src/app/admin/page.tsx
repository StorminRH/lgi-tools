import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { getSession, isAdmin } from '@/features/auth/session';
import { KpiRow } from './KpiRow';
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

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function RangeSelector({ range }: { range: RangeKey }) {
  const linkBase =
    'font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 border transition-colors';
  const active = 'border-border-active text-isk bg-surface-sunk';
  const idle = 'border-border-idle text-muted hover:text-text hover:border-border-active';
  return (
    <div className="no-print flex items-center gap-2">
      {RANGES.map((r) => (
        <a
          key={r}
          href={`/admin?range=${r}`}
          className={`${linkBase} ${r === range ? active : idle}`}
        >
          {r === 'all' ? 'All' : r}
        </a>
      ))}
    </div>
  );
}

function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-mono text-[11px] font-semibold tracking-[0.2em] uppercase text-muted mb-2">
      {children}
    </h2>
  );
}

function SectionFallback() {
  return (
    <div className="border-[1.5px] border-border bg-bg px-3.5 py-6 font-mono text-[11px] text-muted">
      Loading…
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
      <div className="print-only font-mono text-[10px] tracking-[0.12em] uppercase text-muted mb-1">
        Admin report — {formatDate(range.from)} to {formatDate(range.to)}
      </div>
      <PageHead
        crumb="admin"
        title="Admin"
        subtitle={`${formatDate(range.from)} → ${formatDate(range.to)}`}
        meta={
          <div className="flex items-center gap-3">
            <RangeSelector range={rangeKey} />
            <Link
              href="/admin/access"
              className="no-print font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-2 border border-border-idle hover:border-border-active text-muted hover:text-text transition-colors"
            >
              Access →
            </Link>
            <PrintButton />
          </div>
        }
      />

      <div className="w-full flex flex-col gap-8">
        <Suspense fallback={<SectionFallback />}>
          <KpiRow rangeKey={rangeKey} range={range} />
        </Suspense>

        <section>
          <GroupHeading>System health</GroupHeading>
          <Suspense fallback={<SectionFallback />}>
            <StatusStrip range={range} />
          </Suspense>
        </section>

        <section>
          <GroupHeading>Traffic &amp; SEO</GroupHeading>
          <Suspense fallback={<SectionFallback />}>
            <TrafficSection range={range} />
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

// Per-user, session-gated: the content (auth check, redirect, DB reads) is a
// fully request-time dynamic hole. Only the page container prerenders.
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
