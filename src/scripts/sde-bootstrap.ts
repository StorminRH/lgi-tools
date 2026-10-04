export interface SdeRowCounts {
  typeDogma: number;
  npcStations: number;
  systemJumps: number;
  industryTargetFilters: number;
  industryModifiers: number;
  industryAssemblyLines: number;
  industryInstallationTypes: number;
}

export function hasCompleteSdeData(counts: SdeRowCounts): boolean {
  return Object.values(counts).every((count) => count > 0);
}

export function describeSdeStandDown(
  storedVersion: string | null,
  remoteVersion: string | null,
  attributeRows: string,
): string {
  const drifted = remoteVersion !== null && storedVersion !== remoteVersion;
  if (drifted) {
    return `SDE re-ingest deferred to the daily cron (drift: stored=${storedVersion ?? '<none>'} remote=${remoteVersion}; ${attributeRows} attribute rows present).`;
  }
  if (remoteVersion === null) {
    return `SDE ingest skipped (CCP SDE manifest unreachable; staying on stored version "${storedVersion ?? '<none>'}", ${attributeRows} attribute rows present).`;
  }
  return `SDE ingest skipped (already at SDE version "${storedVersion}", ${attributeRows} attribute rows present).`;
}

export function formatSdeVersions(
  storedVersion: string | null,
  remoteVersion: string | null,
): string {
  return `SDE version stored=${storedVersion ?? '<none>'} remote=${remoteVersion ?? '<unreachable>'}`;
}

export function shouldReingestSde(
  storedVersion: string | null,
  remoteVersion: string | null,
  force: boolean,
): boolean {
  if (force) return true;
  return !(remoteVersion !== null && storedVersion === remoteVersion);
}
