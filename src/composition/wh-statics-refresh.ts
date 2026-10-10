import type { AnyPgDb, PostgresJsDb } from '@/lib/db-types';
import { db, directClient } from '@/db';
import { withAdvisoryLock } from '@/db/advisory-lock';
import { directDatabase } from '@/db/direct-database';
import { readWormholeCodex } from '@/data/eve-data/universe-assets';
import type {
  WhStaticsRefreshResult,
} from '@/data/wh-statics/api-contract';
import {
  ADVISORY_LOCK_WH_STATICS_REFRESH,
} from '@/data/wh-statics/constants';
import { crossCheckStatics } from '@/data/wh-statics/cross-check';
import { diffStatics } from '@/data/wh-statics/diff';
import { readPathfinderLineage } from '@/data/wh-statics/lineage';
import { parseStaticsPayload } from '@/data/wh-statics/parse';
import {
  getPendingWhStaticsReview,
  getPendingWhStaticsSummary,
  getSnapshotProbeBaseline,
  promoteSnapshot,
  readPromotedWhStaticsAssignments,
  recordSnapshot,
  rejectSnapshot,
  type WhStaticsProbeBaseline,
} from '@/data/wh-statics/queries';
import {
  fetchStaticsFeed,
  type StaticsFeedResult,
} from '@/data/wh-statics/source';

export type ChangedWhStaticsFeed = Extract<
  StaticsFeedResult,
  { status: 'changed' }
>;

export interface WhStaticsProbe {
  readonly feed: StaticsFeedResult;
  readonly baseline: WhStaticsProbeBaseline;
}

export async function probeWhStaticsRefresh(
  database: AnyPgDb,
): Promise<WhStaticsProbe> {
  const baseline = await getSnapshotProbeBaseline(database);
  return { feed: await fetchStaticsFeed(baseline.etag), baseline };
}

export async function recordChangedWhStaticsFeed(
  database: PostgresJsDb,
  feed: ChangedWhStaticsFeed,
  baseline: WhStaticsProbeBaseline,
): Promise<
  Extract<
    WhStaticsRefreshResult,
    { status: 'snapshot-pending' | 'unchanged' | 'stale-observation' }
  >
> {
  const parsed = parseStaticsPayload(feed.body);
  const [promoted, lineage, codex] = await Promise.all([
    readPromotedWhStaticsAssignments(database),
    readPathfinderLineage(),
    readWormholeCodex(database),
  ]);
  const difference = diffStatics(promoted, parsed.entries);
  const crossCheck = crossCheckStatics(parsed.entries, lineage, codex);
  const record = await recordSnapshot(database, {
    feedVersion: parsed.feedVersion,
    etag: feed.etag,
    lastModified: feed.lastModified,
    baseline,
    entries: parsed.entries,
    difference,
    crossCheck,
  });
  if (record.recorded === 'duplicate') return { status: 'unchanged' };
  if (record.recorded === 'stale') return { status: 'stale-observation' };
  const { snapshotId } = record;
  return {
    status: 'snapshot-pending',
    snapshotId,
    feedVersion: parsed.feedVersion,
    systemCount: new Set(parsed.entries.map((entry) => entry.systemId)).size,
    assignmentCount: parsed.entries.length,
    totalDifferences: difference.totalDifferences,
    disagreementCount: crossCheck.disagreements.length,
  };
}

export async function refreshWhStaticsOnDemand(): Promise<WhStaticsRefreshResult> {
  const { feed, baseline } = await probeWhStaticsRefresh(directDatabase());
  if (feed.status === 'unchanged') return { status: 'unchanged' };
  if (feed.status === 'unavailable') {
    return { status: 'feed-unavailable', reason: feed.reason };
  }

  const outcome = await withAdvisoryLock(
    directClient,
    ADVISORY_LOCK_WH_STATICS_REFRESH,
    () => recordChangedWhStaticsFeed(directDatabase(), feed, baseline),
  );
  return outcome.busy ? { status: 'busy' } : outcome.result;
}

export function promoteWhStaticsSnapshot(snapshotId: number) {
  return promoteSnapshot(directDatabase(), snapshotId);
}

export function rejectWhStaticsSnapshot(snapshotId: number) {
  return rejectSnapshot(directDatabase(), snapshotId);
}

export function getWhStaticsOperatorReview() {
  return getPendingWhStaticsReview(db);
}

export function getWhStaticsOperatorSummary() {
  return getPendingWhStaticsSummary(db);
}
