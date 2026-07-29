import { drizzle } from 'drizzle-orm/postgres-js';
import type { AnyPgDb, PostgresJsDb } from '@/lib/db-types';
import { db, directClient } from '@/db';
import { withAdvisoryLock } from '@/db/advisory-lock';
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

/** Changed feed body retained between the pre-lock probe and locked snapshot write. */
export type ChangedWhStaticsFeed = Extract<
  StaticsFeedResult,
  { status: 'changed' }
>;

/** One pre-lock probe: the feed response and the snapshot state it was read against. */
export interface WhStaticsProbe {
  readonly feed: StaticsFeedResult;
  readonly baseline: WhStaticsProbeBaseline;
}

/**
 * Performs the shared conditional feed probe before any advisory lock is held,
 * retaining the snapshot baseline the response must still match to be recorded.
 */
export async function probeWhStaticsRefresh(
  database: AnyPgDb,
): Promise<WhStaticsProbe> {
  const baseline = await getSnapshotProbeBaseline(database);
  return { feed: await fetchStaticsFeed(baseline.etag), baseline };
}

/**
 * Validates, cross-checks, diffs, and records one changed feed while the caller
 * holds the shared refresh advisory lock.
 */
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

/**
 * Runs the on-demand refresh through the same probe and snapshot writer as the
 * cron, reserving the shared lock only when the feed changed.
 */
export async function refreshWhStaticsOnDemand(): Promise<WhStaticsRefreshResult> {
  const probeDatabase = drizzle(directClient);
  const { feed, baseline } = await probeWhStaticsRefresh(probeDatabase);
  if (feed.status === 'unchanged') return { status: 'unchanged' };
  if (feed.status === 'unavailable') {
    return { status: 'feed-unavailable', reason: feed.reason };
  }

  const outcome = await withAdvisoryLock(
    directClient,
    ADVISORY_LOCK_WH_STATICS_REFRESH,
    () => recordChangedWhStaticsFeed(drizzle(directClient), feed, baseline),
  );
  return outcome.busy ? { status: 'busy' } : outcome.result;
}

/** Promotes one reviewed snapshot through the slice's transactional writer. */
export function promoteWhStaticsSnapshot(snapshotId: number) {
  return promoteSnapshot(drizzle(directClient), snapshotId);
}

/** Rejects one reviewed snapshot through the slice's transactional writer. */
export function rejectWhStaticsSnapshot(snapshotId: number) {
  return rejectSnapshot(drizzle(directClient), snapshotId);
}

/** Returns the pending snapshot projection for the admin operator surface. */
export function getWhStaticsOperatorReview() {
  return getPendingWhStaticsReview(db);
}
