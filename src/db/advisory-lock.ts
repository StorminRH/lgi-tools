// The session-scoped advisory-lock scaffold every overlap-guarded job shares
// (crons + deploy scripts): reserve one connection, try the lock, busy-skip if
// another run holds it, run the work, then unlock with release as the OUTERMOST
// cleanup. One implementation means the unlock/release ordering can't drift —
// if the unlock query itself threw, skipping release() would leak the
// connection AND leave the session lock held, wedging every later run at
// 'busy' until the pool recycled it. Locks guard redundant double-pulls
// (idempotent writes), not data integrity; lock-key constants stay in the
// owning slice.
import type { ReservedConnection, Sql } from './index';

/**
 * Direct unpooled PostgreSQL session reserved for advisory-lock work; the lock helper owns
 * releasing and closing it. Re-exported from `@/db`, which owns the alias, so existing
 * `@/db/advisory-lock` consumers keep their import path.
 */
export type { ReservedConnection };

/**
 * Closed advisory-lock result distinguishing completed callback work from lock contention without
 * treating contention as an error.
 */
export type AdvisoryLockOutcome<T> = { busy: true } | { busy: false; result: T };

/**
 * Runs a callback while holding one PostgreSQL session advisory lock on a reserved, unpooled
 * connection; release and connection close always run in finally.
 */
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
