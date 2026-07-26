import { Card } from '@/components/ui/card';
import { DistributionBars } from '@/components/ui/distribution-bars';
import { EmptyState } from '@/components/ui/empty-state';
import { MultiplesCell, MultiplesGrid } from '@/components/ui/multiples-grid';
import { Pill, type PillTone } from '@/components/ui/pill';
import { scrollArea } from '@/components/ui/scroll-area';
import { SectionHeader } from '@/components/ui/section-header';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import { getSitemapEntries } from '@/composition/sitemap';
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
  const columns = [
    { key: 'url', label: 'URL', render: (row) => row.url, className: 'break-all text-text' },
    {
      key: 'verdict',
      label: 'Verdict',
      render: (row) => <Pill tone={coverageTone(row.verdict)}>{row.verdict ?? 'UNKNOWN'}</Pill>,
    },
    { key: 'reason', label: 'Coverage reason', render: (row) => row.reason, className: 'text-muted' },
    {
      key: 'inspected',
      label: 'Inspected',
      render: (row) => row.inspectionDate ?? 'Never',
      className: 'whitespace-nowrap text-muted',
    },
    {
      key: 'crawl',
      label: 'Last crawl',
      render: (row) => row.lastCrawlTime ? formatIsoDay(row.lastCrawlTime) : 'Unknown',
      className: 'whitespace-nowrap text-muted',
    },
  ] satisfies readonly StaticTableColumn<GscCoverageRow>[];
  return (
    <div className={`${scrollArea} max-h-96 overflow-auto border-t border-border-soft`}>
      <StaticTable
        ariaLabel="Latest Google Search Console inspection result for every sitemap URL"
        theadClassName="sticky top-0 z-[1] bg-section"
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.url}
      />
    </div>
  );
}

/**
 * Renders the gsc coverage section surface; this component owns local presentation and interaction
 * wiring while callers own domain data.
 */
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

  const fetched = await loadSection('gsc-coverage', async () => {
    const sitemapUrls = (await getSitemapEntries()).map(({ url }) => url);
    return Promise.all([
      getLatestUrlCoverage(sitemapUrls),
      getCoverageTrend(range),
    ]);
  });
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
          <SectionHeader variant="sub" label="Latest coverage reasons" className="border-y border-border-soft px-3.5 py-2" />
          <DistributionBars rows={view.reasons} ariaLabel="Latest URL coverage reasons" />
          <SectionHeader variant="sub" label="Latest URL status · non-indexed first" className="border-t border-border-soft px-3.5 py-2" />
          <CoverageTable rows={view.rows} />
        </>
      )}
    </Card>
  );
}
