import { drizzle } from 'drizzle-orm/postgres-js';
import type { CronRouteDeclaration } from '@/composition/pipelines/cron-gate';
import {
  probeWhStaticsRefresh,
  recordChangedWhStaticsFeed,
  type ChangedWhStaticsFeed,
} from '@/composition/wh-statics-refresh';
import type { CronRefreshWhStaticsResponse } from '@/data/wh-statics/api-contract';
import { ADVISORY_LOCK_WH_STATICS_REFRESH } from '@/data/wh-statics/constants';
import type { WhStaticsProbeBaseline } from '@/data/wh-statics/queries';

/** Changed feed state passed from the pre-lock probe into locked cron work. */
export interface WhStaticsPreLock {
  readonly feed: ChangedWhStaticsFeed;
  readonly baseline: WhStaticsProbeBaseline;
}

/**
 * Declares the weekly statics refresh. Unchanged and unavailable feeds finish
 * before lock reservation; only a changed body reaches the snapshot writer.
 */
export const refreshWhStaticsDeclaration: CronRouteDeclaration<
  CronRefreshWhStaticsResponse,
  WhStaticsPreLock
> = {
  name: 'cron:wh-statics',
  action: 'cron_wh_statics',
  capability: 'cron.refresh-wh-statics',
  wakeClass: 'batch',
  record: {
    policy: 'always',
    justification:
      'weekly batch preserves every unchanged, feed-unavailable, stale-observation, and snapshot-pending outcome for operator review',
  },
  lock: {
    key: ADVISORY_LOCK_WH_STATICS_REFRESH,
    busyBody: () => ({ status: 'busy' }),
  },
  preLock: async ({ client }) => {
    const { feed, baseline } = await probeWhStaticsRefresh(drizzle(client));
    if (feed.status === 'unchanged') {
      return {
        done: {
          outcome: 'unchanged',
          workDone: false,
          body: { status: 'unchanged' },
        },
      };
    }
    if (feed.status === 'unavailable') {
      return {
        done: {
          outcome: 'feed-unavailable',
          workDone: false,
          telemetry: { reason: feed.reason },
          body: { status: 'feed-unavailable', reason: feed.reason },
        },
      };
    }
    return { proceed: { feed, baseline } };
  },
  work: async ({ client, reserved }, { feed, baseline }) => {
    if (reserved === undefined) {
      throw new Error('Statics refresh reached work without a reserved lock connection.');
    }
    // The shell holds the advisory lock on its reserved session while the
    // transactional snapshot write uses the shared direct postgres-js pool.
    const result = await recordChangedWhStaticsFeed(
      drizzle(client),
      feed,
      baseline,
    );
    if (result.status !== 'snapshot-pending') {
      return {
        outcome: result.status,
        workDone: false,
        body: result,
      };
    }
    return {
      outcome: 'snapshot-pending',
      workDone: true,
      telemetry: {
        snapshotId: result.snapshotId,
        feedVersion: result.feedVersion,
        systemCount: result.systemCount,
        assignmentCount: result.assignmentCount,
        totalDifferences: result.totalDifferences,
        disagreementCount: result.disagreementCount,
      },
      body: result,
    };
  },
};
