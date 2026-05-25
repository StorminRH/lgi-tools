// At-a-glance activity card on /admin. Shows the last 7 days of telemetry:
// three headline counters + the top-5 actions with a horizontal-bar
// visualisation made from styled divs (no charting library — see the
// 2.8.3 changelog parser precedent for the minimal-deps stance).
//
// Server Component, gated upstream by the page's isAdmin() check.

import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import {
  getAggregateSummary,
  getTopActions,
  lastNDaysRange,
} from '@/data/telemetry/queries';

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

function ActionBar({
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
        <span className="font-mono text-[11px] text-text">{label}</span>
        <span className="font-mono text-[10px] text-muted tabular-nums">
          {count.toLocaleString()}
        </span>
      </div>
      <div className="h-[4px] bg-[#0a1018] border border-[#101820]">
        <div
          className="h-full bg-[#10283a]"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

export async function AdminActivitySummary() {
  const range = lastNDaysRange(7);
  const [summary, topActions] = await Promise.all([
    getAggregateSummary(range),
    getTopActions(range, 5),
  ]);

  const max = topActions.reduce((m, r) => Math.max(m, r.count), 0);

  return (
    <Card>
      <SectionHeader
        label="Activity — last 7 days"
        hint={
          <a
            href="/admin/usage"
            className="font-mono text-[9px] tracking-[0.12em] uppercase text-isk hover:text-name transition-colors"
          >
            Full report →
          </a>
        }
      />
      <div className="px-3.5 py-3 grid grid-cols-3 gap-2">
        <StatBlock label="Total events" value={summary.totalEvents} />
        <StatBlock label="Unique characters" value={summary.uniqueCharacters} />
        <StatBlock label="Anonymous events" value={summary.anonymousEvents} />
      </div>
      <SectionHeader label="Top actions" />
      {topActions.length === 0 ? (
        <div className="px-3.5 py-4 text-[11px] text-muted italic">
          No telemetry recorded in the last 7 days yet.
        </div>
      ) : (
        topActions.map((row) => (
          <ActionBar
            key={row.action}
            label={formatActionLabel(row.action)}
            count={row.count}
            max={max}
          />
        ))
      )}
      <div className="px-3.5 py-2 border-t border-border bg-section flex items-center gap-2">
        <Pill tone="neutral">{summary.totalEvents.toLocaleString()} events</Pill>
        <span className="text-[10px] text-muted">
          {range.from.toISOString().slice(0, 10)} → {range.to.toISOString().slice(0, 10)}
        </span>
      </div>
    </Card>
  );
}
