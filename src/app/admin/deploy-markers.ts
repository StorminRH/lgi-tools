import { loadChangelog } from '@/features/changelog/load';

// Deploy markers for the Activity chart, derived from the changelog's own dates
// (every sub-version entry carries a machine-readable ISO date). Best-effort: a
// changelog read/parse failure must never take down the traffic section, so this
// swallows errors and returns []. The chart clips these to the visible range and
// dedupes to one marker per day.
export async function loadDeployMarkers(): Promise<{ date: string; label: string }[]> {
  try {
    const masters = await loadChangelog();
    return masters.flatMap((master) =>
      master.subVersions.map((entry) => ({ date: entry.date, label: `v${entry.version}` })),
    );
  } catch {
    return [];
  }
}
