import { Card } from '@/components/ui/card';
import { DistributionBars } from '@/components/ui/distribution-bars';
import { EmptyState } from '@/components/ui/empty-state';
import { MultiplesCell, MultiplesGrid } from '@/components/ui/multiples-grid';
import { Pill, type PillTone } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import { isGscConfigured } from '@/data/gsc/constants';
import { getCoverageTrend, getLatestUrlCoverage } from '@/data/gsc/queries';
import type { GscRange } from '@/data/gsc/types';
import { formatIsoDay } from '@/lib/format/time';
import { AdminTrendChart } from './charts';
import { deriveGscCoverageView, type GscCoverageRow } from './gsc-coverage-view';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { SectionUnavailable } from './SectionUnavailable';

function coverageTone(verdict: string | null): PillTone {
  if (verdict === 'PASS') return 'green';
  if (verdict === 'FAIL') return 'red';
  if (verdict === 'NEUTRAL') return 'orange';
  return 'neutral';
}

function shareLabel(value: number, total: number): string {
  return total === 0 ? '0% of latest URLs' : `${Math.round((value / total) * 100)}% of latest URLs`;
}

function CoverageTable({ rows }: { rows: GscCoverageRow[] }) {
  return (
    <div className="max-h-96 overflow-auto border-t border-border-soft">
      <table className="min-w-full border-collapse text-left">
        <caption className="sr-only">
          Latest Google Search Console inspection result for every sitemap URL
        </caption>
        <thead className="sticky top-0 bg-section z-sticky">
          <tr className="border-b border-border-soft">
            {['URL', 'Verdict', 'Coverage reason', 'Inspected', 'Last crawl'].map((label) => (
              <th
                key={label}
                scope="col"
                className="px-3.5 py-2 text-label tracking-display uppercase text-muted whitespace-nowrap"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.url} className="border-b border-border-soft last:border-b-0 align-top">
              <td className="px-3.5 py-2 font-mono text-ui text-text break-all">{row.url}</td>
              <td className="px-3.5 py-2 whitespace-nowrap">
                <Pill tone={coverageTone(row.verdict)}>{row.verdict ?? 'UNKNOWN'}</Pill>
              </td>
              <td className="px-3.5 py-2 font-mono text-ui text-muted">{row.reason}</td>
              <td className="px-3.5 py-2 font-mono text-ui text-muted whitespace-nowrap">
                {row.inspectionDate}
              </td>
              <td className="px-3.5 py-2 font-mono text-ui text-muted whitespace-nowrap">
                {row.lastCrawlTime ? formatIsoDay(row.lastCrawlTime) : 'Unknown'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function GscCoverageSection({ range }: { range: GscRange }) {
  if (!isGscConfigured()) {
    return (
      <Card>
        <SectionHeader size="md" label="Index coverage" hint="Google Search Console" />
        <EmptyState>
          Not connected — set GSC_SERVICE_ACCOUNT_JSON and GSC_SITE_URL to sync index
          coverage.
        </EmptyState>
      </Card>
    );
  }

  const fetched = await loadSection('gsc-coverage', () =>
    Promise.all([getLatestUrlCoverage(), getCoverageTrend(range)]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Index coverage" />;

  const [latest, trend] = fetched;
  const view = deriveGscCoverageView({ latest, trend });
  return (
    <Card>
      <SectionHeader size="md" label="Index coverage" hint="daily URL inspection" />
      {view.total === 0 ? (
        <EmptyState>No URL inspection history synced yet.</EmptyState>
      ) : (
        <>
          <MultiplesGrid columns={2}>
            <MultiplesCell
              title="Indexed"
              value={view.indexed.toLocaleString()}
              note={shareLabel(view.indexed, view.total)}
            >
              <AdminTrendChart
                points={view.indexedTrend.points}
                labels={view.indexedTrend.labels}
                unit="count"
                tone="green"
                height={128}
                ariaLabel="Indexed sitemap URLs by inspection day"
              />
            </MultiplesCell>
            <MultiplesCell
              title="Not indexed"
              value={view.notIndexed.toLocaleString()}
              note={shareLabel(view.notIndexed, view.total)}
            >
              <AdminTrendChart
                points={view.notIndexedTrend.points}
                labels={view.notIndexedTrend.labels}
                unit="count"
                tone="orange"
                height={128}
                ariaLabel="Not-indexed sitemap URLs by inspection day"
              />
            </MultiplesCell>
          </MultiplesGrid>
          <div className="px-3.5 py-2 text-label tracking-display uppercase text-muted border-y border-border-soft">
            Latest coverage reasons
          </div>
          <DistributionBars rows={view.reasons} ariaLabel="Latest URL coverage reasons" />
          <div className="px-3.5 py-2 text-label tracking-display uppercase text-muted border-t border-border-soft">
            Latest URL status · non-indexed first
          </div>
          <CoverageTable rows={view.rows} />
        </>
      )}
    </Card>
  );
}
