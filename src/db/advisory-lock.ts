import type { ReservedConnection, Sql } from './index';

export type { ReservedConnection };

/**
 * Every session advisory-lock key in the project, in Postgres's single-bigint
 * key space. A shared key makes an unrelated run report busy, so keys are
 * registered here only. Values never change: old and new deployments overlap,
 * and a changed key would let two runs proceed at once. The wh-statics key is
 * shared on purpose by the cron and the on-demand admin refresh.
 *
 * Retired, never reuse: 8_273_619_012 (prices), 8_273_619_016 (affiliation
 * refresh), 8_419_273_051 (auth backfill).
 */
export const ADVISORY_LOCKS = {
  sdeIngest: 8_273_619_013,
  industryIndices: 8_273_619_014,
  gscSync: 8_273_619_015,
  esiRefreshQueue: 8_273_619_017,
  whStaticsRefresh: 8_273_619_018,
  mapPurge: 8_273_619_019,
} as const;

export type AdvisoryLockOutcome<T> = { busy: true } | { busy: false; result: T };

export async function withAdvisoryLock<T>(
  client: Sql,
  lockKey: number,
  work: (reserved: ReservedConnection) => Promise<T>,
): Promise<AdvisoryLockOutcome<T>> {
  const reserved = await client.reserve();
  let lockHeld = false;
  try {
    const lockResult = await reserved<{ got: boolean }[]>`
      SELECT pg_try_advisory_lock(${lockKey}) AS got
    `;
    const [lockRow] = lockResult;
    if (!lockRow) throw new Error('advisory lock query returned no row');
    if (!lockRow.got) {
      return { busy: true };
    }
    lockHeld = true;
    return { busy: false, result: await work(reserved) };
  } finally {
    try {
      if (lockHeld) {
        await reserved`SELECT pg_advisory_unlock(${lockKey})`;
      }
    } finally {
      reserved.release();
    }
  }
}
