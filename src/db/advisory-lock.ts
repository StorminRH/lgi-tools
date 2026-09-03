import type { ReservedConnection, Sql } from './index';

export type { ReservedConnection };

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
