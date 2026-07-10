// Pure decisions the SDE entry scripts share — the version gate that the deploy
// bootstrap (ingest-sde-if-empty), the manual refresh (refresh-sde), and the
// daily cron all reason about identically. Extracted here (import-safe, tested)
// so each entry's main() stays a thin orchestrator: it does the DB I/O and
// calls these to decide.

export interface SdeRowCounts {
  typeDogma: number;
  npcStations: number;
  systemJumps: number;
}

// "Populated" means EVERY SDE dataset is present, not just the original
// type/blueprint set — each sentinel table is ANDed in so the first deploy that
// ships a new dataset force-runs a full ingest instead of skipping because the
// older tables look current. `eve_npc_stations` is the universe sentinel
// (3.5.1a); `eve_system_jumps` is the J-space/stargate sentinel (3.7.2.2).
export function hasCompleteSdeData(counts: SdeRowCounts): boolean {
  return counts.typeDogma > 0 && counts.npcStations > 0 && counts.systemJumps > 0;
}

// Populated tables: never re-ingest at build time. If CCP has drifted, the
// daily refresh-sde cron owns the re-ingest + cache revalidation (a mid-build
// pipeline run would load the DB and stall the prerender — the 3.6.27
// deploy-timeout cause), so this only explains why we're standing down.
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
    return `SDE ingest skipped (CCP SDE manifest unreachable; staying on stored version "${storedVersion}", ${attributeRows} attribute rows present).`;
  }
  return `SDE ingest skipped (already at SDE version "${storedVersion}", ${attributeRows} attribute rows present).`;
}

// The stored-vs-remote version line the manual refresh logs before deciding.
export function formatSdeVersions(
  storedVersion: string | null,
  remoteVersion: string | null,
): string {
  return `SDE version stored=${storedVersion ?? '<none>'} remote=${remoteVersion ?? '<unreachable>'}`;
}

// The manual refresh's drift gate: re-ingest when forced, or when CCP's build
// number is reachable and differs from ours. A no-drift, unforced run is a
// no-op (an unreachable manifest with no --force is also a no-op — nothing
// actionable to re-ingest toward).
export function shouldReingestSde(
  storedVersion: string | null,
  remoteVersion: string | null,
  force: boolean,
): boolean {
  if (force) return true;
  return remoteVersion !== null && storedVersion !== remoteVersion;
}
