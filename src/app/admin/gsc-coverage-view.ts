import type { GscCoverageDailyPoint, GscUrlStatus } from '@/data/gsc/types';
import { trendSeries } from './period';

export interface GscCoverageRow extends GscUrlStatus {
  indexed: boolean;
  reason: string;
}

export function isIndexedVerdict(verdict: string | null): boolean {
  return verdict === 'PASS';
}

export function deriveGscCoverageView(input: {
  latest: GscUrlStatus[];
  trend: GscCoverageDailyPoint[];
}) {
  const rows: GscCoverageRow[] = input.latest
    .map((row) => ({
      ...row,
      indexed: isIndexedVerdict(row.verdict),
      reason: row.coverageState ?? 'Unknown',
    }))
    .sort((a, b) => {
      if (a.indexed !== b.indexed) return a.indexed ? 1 : -1;
      return a.url.localeCompare(b.url);
    });
  const indexed = rows.filter((row) => row.indexed).length;
  const reasons = new Map<string, number>();
  for (const row of rows) reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1);

  const chronological = [...input.trend].sort((a, b) => a.day.localeCompare(b.day));
  const labels = chronological.map((point) => point.day);
  return {
    total: rows.length,
    indexed,
    notIndexed: rows.length - indexed,
    rows,
    reasons: [...reasons]
      .map(([reason, count]) => ({ key: reason, label: reason, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    indexedTrend: trendSeries(
      labels,
      chronological.map((point) => point.indexed),
    ),
    notIndexedTrend: trendSeries(
      labels,
      chronological.map((point) => point.notIndexed),
    ),
  };
}
