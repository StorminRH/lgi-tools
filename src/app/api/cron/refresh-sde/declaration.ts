import { drizzle } from 'drizzle-orm/postgres-js';
import { revalidateTag } from 'next/cache';
import type { CronRefreshSdeResponse } from '@/data/eve-data/api-contract';
import {
  ADVISORY_LOCK_SDE_INGEST,
  BLUEPRINT_STRUCTURE_TAG,
  SDE_META_KEY_VERSION,
} from '@/data/eve-data/constants';
import { getSdeMetaValue, setSdeMetaValue } from '@/data/eve-data/meta';
import { getRemoteSdeVersion } from '@/data/eve-data/source';
import type { CronRouteDeclaration } from '@/composition/pipelines/cron-gate';
import {
  runSdePipeline,
  summarizeMarketPricesRowCount,
} from '@/composition/pipelines/sde-pipeline';

type SdePreLock = {
  db: ReturnType<typeof drizzle>;
  storedVersion: string | null;
  remoteVersion: string | null;
};

/**
 * Declares the daily SDE refresh with its version check before lock
 * reservation, so up-to-date and manifest-unreachable runs do not pin a
 * connection while every daily outcome remains durable.
 */
export const refreshSdeDeclaration: CronRouteDeclaration<
  CronRefreshSdeResponse,
  SdePreLock
> = {
  name: 'cron:sde',
  action: 'cron_sde',
  wakeClass: 'batch',
  record: {
    policy: 'always',
    justification: 'daily batch wakes Neon by design and preserves version-gate history',
  },
  lock: {
    key: Number(ADVISORY_LOCK_SDE_INGEST),
    busyBody: () => ({
      status: 'busy',
      message: 'Another SDE ingest in flight',
    }),
  },
  preLock: async ({ client }) => {
    const db = drizzle(client);
    const storedVersion = await getSdeMetaValue(db, SDE_META_KEY_VERSION);
    const remoteVersion = await getRemoteSdeVersion();

    if (remoteVersion !== null && storedVersion === remoteVersion) {
      return {
        done: {
          outcome: 'up-to-date',
          workDone: false,
          telemetry: { sdeVersion: storedVersion },
          body: {
            status: 'up-to-date',
            sdeVersion: storedVersion,
          },
        },
      };
    }

    // A known local version plus an unreachable manifest is not actionable;
    // avoid both the lock and a doomed pipeline download until the next tick.
    if (storedVersion !== null && remoteVersion === null) {
      return {
        done: {
          outcome: 'remote-unreachable',
          workDone: false,
          telemetry: { sdeVersion: storedVersion },
          body: {
            status: 'remote-unreachable',
            sdeVersion: storedVersion,
          },
        },
      };
    }

    return { proceed: { db, storedVersion, remoteVersion } };
  },
  work: async (_ctx, { db, storedVersion, remoteVersion }) => {
    const summary = await runSdePipeline(db);
    if (remoteVersion) {
      await setSdeMetaValue(db, SDE_META_KEY_VERSION, remoteVersion);
    }
    // Re-ingest rebuilds blueprint trees and flat materials without a deploy,
    // so the planner/search cache needs an explicit post-refresh invalidation.
    revalidateTag(BLUEPRINT_STRUCTURE_TAG, 'max');
    const marketPrices = await summarizeMarketPricesRowCount(db);

    return {
      outcome: 'reingested',
      workDone: true,
      telemetry: {
        sdeVersionBefore: storedVersion,
        sdeVersionAfter: remoteVersion,
        summary,
        marketPrices,
      },
      body: {
        status: 'reingested',
        sdeVersionBefore: storedVersion,
        sdeVersionAfter: remoteVersion,
        summary,
        marketPrices,
      },
    };
  },
};
