import { loadChangelog } from '@/features/changelog/load';

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
