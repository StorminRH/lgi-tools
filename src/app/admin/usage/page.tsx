import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SectionHeader } from '@/components/ui/section-header';
import {
  getAggregateSummary,
  getDailyCounts,
  getRoleChangeAudit,
  getSitesViewSplit,
  getTopActions,
  getTopEntryPages,
  getTopPages,
  getTopReferrers,
  getTopSearches,
  getTopUtmSources,
} from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { getSession, isAdmin } from '@/features/auth/session';
import { PrintButton } from './PrintButton';

const RANGES = ['7d', '30d', '90d', 'all'] as const;
type RangeKey = (typeof RANGES)[number];

const ACTION_LABEL: Record<string, string> = {
  page_view: 'Page views',
  terminal_search: 'Terminal searches',
  auth_login: 'Logins',
  auth_logout: 'Logouts',
  role_change: 'Role changes',
};

function formatActionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

// Date floor for `all` is set to a year before the first user is plausibly
// active; in practice the table only goes back to 2.8.4's deploy day.
const ALL_TIME_FROM = new Date('2025-01-01T00:00:00Z');

function rangeFor(key: RangeKey, now: Date = new Date()): DateRange {
  if (key === 'all') return { from: ALL_TIME_FROM, to: now };
  const days = key === '7d' ? 7 : key === '30d' ? 30 : 90;
  return { from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), to: now };
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateTime(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

function RangeSelector({ active }: { active: RangeKey }) {
  return (
    <div className="no-print flex items-center gap-2">
      {RANGES.map((r) => {
        const isActive = r === active;
        return (
          <a
            key={r}
            href={`/admin/usage?range=${r}`}
            className={
              isActive
                ? 'font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 border border-[#2a3550] text-isk bg-[#0a101a]'
                : 'font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 border border-[#1e2c3a] text-muted hover:text-text hover:border-[#2a3550] transition-colors'
            }
          >
            {r === 'all' ? 'All' : r}
          </a>
        );
      })}
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-start gap-1 px-4 py-3 border border-border bg-bg">
      <div className="font-display font-bold text-[28px] leading-none text-name tabular-nums">
        {value.toLocaleString()}
      </div>
      <div className="text-[9px] tracking-[0.16em] uppercase text-muted">{label}</div>
    </div>
  );
}

function HorizontalBar({
  label,
  count,
  max,
}: {
  label: string;
  count: number;
  max: number;
}) {
  const pct = max === 0 ? 0 : Math.max(2, Math.round((count / max) * 100));
  return (
    <div className="px-3.5 py-2 border-b border-border-soft last:border-b-0">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[11px] text-text break-all">{label}</span>
        <span className="font-mono text-[10px] text-muted tabular-nums shrink-0 ml-3">
          {count.toLocaleString()}
        </span>
      </div>
      <ProgressBar pct={pct} />
    </div>
  );
}

function pctLabel(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function parseRange(raw: string | string[] | undefined): RangeKey {
  if (typeof raw !== 'string') return '30d';
  return (RANGES as readonly string[]).includes(raw) ? (raw as RangeKey) : '30d';
}

async function AdminUsageContent({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const session = await getSession();
  if (!isAdmin(session)) {
    redirect('/?auth_error=admin_required');
  }

  const raw = await searchParams;
  const activeRange = parseRange(raw.range);
  const range = rangeFor(activeRange);

  const [
    summary,
    topActions,
    dailyCounts,
    topPages,
    topSearches,
    roleAudit,
    viewSplit,
    topReferrers,
    topUtmSources,
    topEntryPages,
  ] = await Promise.all([
    getAggregateSummary(range),
    getTopActions(range, 10),
    getDailyCounts(range),
    getTopPages(range, 10),
    getTopSearches(range, 10),
    getRoleChangeAudit(range, 50),
    getSitesViewSplit(range),
    getTopReferrers(range, 10),
    getTopUtmSources(range, 10),
    getTopEntryPages(range, 10),
  ]);

  const topActionMax = topActions.reduce((m, r) => Math.max(m, r.count), 0);
  const topPagesMax = topPages.reduce((m, r) => Math.max(m, r.count), 0);
  const topSearchesMax = topSearches.reduce((m, r) => Math.max(m, r.count), 0);
  const dailyMax = dailyCounts.reduce((m, r) => Math.max(m, r.totalEvents), 0);
  const viewSplitTotal = viewSplit.cards + viewSplit.table;
  const viewSplitMax = Math.max(viewSplit.cards, viewSplit.table);
  const topReferrersMax = topReferrers.reduce((m, r) => Math.max(m, r.count), 0);
  const topUtmSourcesMax = topUtmSources.reduce((m, r) => Math.max(m, r.count), 0);
  const topEntryPagesMax = topEntryPages.reduce((m, r) => Math.max(m, r.count), 0);

  return (
    <>
      <header className="w-full max-w-[1100px] mb-6 pb-4 border-b border-border-soft">
        <div className="print-only font-mono text-[10px] tracking-[0.12em] uppercase text-muted mb-1">
          Usage report — {formatDate(range.from)} to {formatDate(range.to)}
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
              Usage report
            </div>
            <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
              {formatDate(range.from)} → {formatDate(range.to)} · {summary.totalEvents.toLocaleString()} events
            </div>
          </div>
          <div className="flex items-center gap-3">
            <RangeSelector active={activeRange} />
            <PrintButton />
          </div>
        </div>
      </header>

      <div className="w-full max-w-[1100px] flex flex-col gap-6">
        <Card>
          <SectionHeader label="Summary" />
          <div className="px-3.5 py-3 grid grid-cols-3 gap-2">
            <StatBlock label="Total events" value={summary.totalEvents} />
            <StatBlock label="Unique characters" value={summary.uniqueCharacters} />
            <StatBlock label="Anonymous events" value={summary.anonymousEvents} />
          </div>
        </Card>

        <Card>
          <SectionHeader
            label="Daily activity"
            hint={`${dailyCounts.length} day${dailyCounts.length === 1 ? '' : 's'} with events`}
          />
          {dailyCounts.length === 0 ? (
            <EmptyState>No events in this range.</EmptyState>
          ) : (
            <div className="px-3.5 py-2">
              <table className="w-full font-mono text-[11px]">
                <thead>
                  <tr className="text-[9px] tracking-[0.12em] uppercase text-muted">
                    <th className="text-left py-1.5 font-normal">Date</th>
                    <th className="text-right py-1.5 font-normal">Events</th>
                    <th className="text-right py-1.5 font-normal">Unique chars</th>
                    <th className="text-right py-1.5 font-normal">Anonymous</th>
                    <th className="text-left py-1.5 font-normal pl-4 w-[40%]">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyCounts.map((row) => {
                    const pct =
                      dailyMax === 0
                        ? 0
                        : Math.max(2, Math.round((row.totalEvents / dailyMax) * 100));
                    return (
                      <tr key={row.day} className="border-t border-border-soft">
                        <td className="py-1.5 text-text">{row.day}</td>
                        <td className="py-1.5 text-right text-text tabular-nums">
                          {row.totalEvents.toLocaleString()}
                        </td>
                        <td className="py-1.5 text-right text-muted tabular-nums">
                          {row.uniqueCharacters.toLocaleString()}
                        </td>
                        <td className="py-1.5 text-right text-muted tabular-nums">
                          {row.anonymousEvents.toLocaleString()}
                        </td>
                        <td className="py-1.5 pl-4">
                          <ProgressBar pct={pct} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <SectionHeader label="Top actions" hint={`${topActions.length} distinct`} />
          {topActions.length === 0 ? (
            <EmptyState>No actions recorded.</EmptyState>
          ) : (
            topActions.map((row) => (
              <HorizontalBar
                key={row.action}
                label={formatActionLabel(row.action)}
                count={row.count}
                max={topActionMax}
              />
            ))
          )}
        </Card>

        <Card>
          <SectionHeader label="Top pages" hint={`${topPages.length} paths`} />
          {topPages.length === 0 ? (
            <EmptyState>No page-view events in this range.</EmptyState>
          ) : (
            topPages.map((row) => (
              <HorizontalBar
                key={row.path}
                label={row.path}
                count={row.count}
                max={topPagesMax}
              />
            ))
          )}
        </Card>

        <Card>
          <SectionHeader
            label="Acquisition"
            hint={`${topReferrers.length + topUtmSources.length + topEntryPages.length} signals`}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border-soft">
            <div className="bg-bg">
              <div className="px-3.5 py-2 text-[9px] tracking-[0.16em] uppercase text-muted border-b border-border-soft">
                Top referrers
              </div>
              {topReferrers.length === 0 ? (
                <EmptyState>No external referrers in this range.</EmptyState>
              ) : (
                topReferrers.map((row) => (
                  <HorizontalBar
                    key={row.host}
                    label={row.host}
                    count={row.count}
                    max={topReferrersMax}
                  />
                ))
              )}
            </div>
            <div className="bg-bg">
              <div className="px-3.5 py-2 text-[9px] tracking-[0.16em] uppercase text-muted border-b border-border-soft">
                Top UTM sources
              </div>
              {topUtmSources.length === 0 ? (
                <EmptyState>No UTM-tagged traffic in this range.</EmptyState>
              ) : (
                topUtmSources.map((row) => (
                  <HorizontalBar
                    key={row.source}
                    label={row.source}
                    count={row.count}
                    max={topUtmSourcesMax}
                  />
                ))
              )}
            </div>
            <div className="bg-bg">
              <div className="px-3.5 py-2 text-[9px] tracking-[0.16em] uppercase text-muted border-b border-border-soft">
                Top entry pages
              </div>
              {topEntryPages.length === 0 ? (
                <EmptyState>No session entry events in this range.</EmptyState>
              ) : (
                topEntryPages.map((row) => (
                  <HorizontalBar
                    key={row.path}
                    label={row.path}
                    count={row.count}
                    max={topEntryPagesMax}
                  />
                ))
              )}
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader
            label="Wormhole Sites · view split"
            hint={`${viewSplitTotal.toLocaleString()} total`}
          />
          {viewSplitTotal === 0 ? (
            <EmptyState>No /sites page views in this range.</EmptyState>
          ) : (
            <>
              <HorizontalBar
                label={`Card grid (default) — ${pctLabel(viewSplit.cards, viewSplitTotal)}`}
                count={viewSplit.cards}
                max={viewSplitMax}
              />
              <HorizontalBar
                label={`Table view — ${pctLabel(viewSplit.table, viewSplitTotal)}`}
                count={viewSplit.table}
                max={viewSplitMax}
              />
            </>
          )}
        </Card>

        <Card>
          <SectionHeader label="Top terminal searches" hint={`${topSearches.length} queries`} />
          {topSearches.length === 0 ? (
            <EmptyState>No terminal searches in this range.</EmptyState>
          ) : (
            topSearches.map((row) => (
              <HorizontalBar
                key={row.query}
                label={row.query}
                count={row.count}
                max={topSearchesMax}
              />
            ))
          )}
        </Card>

        <Card>
          <SectionHeader label="Role change audit" hint={`${roleAudit.length} entries`} />
          {roleAudit.length === 0 ? (
            <EmptyState>No role changes in this range.</EmptyState>
          ) : (
            <div className="px-3.5 py-2">
              <table className="w-full font-mono text-[11px]">
                <thead>
                  <tr className="text-[9px] tracking-[0.12em] uppercase text-muted">
                    <th className="text-left py-1.5 font-normal">Timestamp (UTC)</th>
                    <th className="text-left py-1.5 font-normal">Actor</th>
                    <th className="text-left py-1.5 font-normal">Target</th>
                    <th className="text-left py-1.5 font-normal">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {roleAudit.map((row, idx) => (
                    <tr
                      key={`${row.timestamp.toISOString()}-${idx}`}
                      className="border-t border-border-soft"
                    >
                      <td className="py-1.5 text-text">{formatDateTime(row.timestamp)}</td>
                      <td className="py-1.5 text-text">
                        {row.actorName ?? `id ${row.actorCharacterId ?? '?'}`}
                      </td>
                      <td className="py-1.5 text-text">
                        {row.targetName ?? `id ${row.targetCharacterId ?? '?'}`}
                      </td>
                      <td className="py-1.5">
                        <span className="flex items-center gap-1.5">
                          <Pill tone={row.from === 'ADMIN' ? 'purple' : 'blue'}>
                            {row.from ?? '?'}
                          </Pill>
                          <span className="text-muted">→</span>
                          <Pill tone={row.to === 'ADMIN' ? 'purple' : 'blue'}>
                            {row.to ?? '?'}
                          </Pill>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function AdminUsageLoading() {
  return (
    <span className="text-[10px] tracking-[0.12em] uppercase text-muted">Loading…</span>
  );
}

// Per-user, session-gated telemetry: the whole report is a request-time dynamic
// hole. Only the page container prerenders.
export default function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20 gap-0">
      <Suspense fallback={<AdminUsageLoading />}>
        <AdminUsageContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
