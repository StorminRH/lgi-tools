// The session-scoped advisory-lock scaffold every overlap-guarded job shares
// (crons + deploy scripts): reserve one connection, try the lock, busy-skip if
// another run holds it, run the work, then unlock with release as the OUTERMOST
// cleanup. One implementation means the unlock/release ordering can't drift —
// if the unlock query itself threw, skipping release() would leak the
// connection AND leave the session lock held, wedging every later run at
// 'busy' until the pool recycled it. Locks guard redundant double-pulls
// (idempotent writes), not data integrity; lock-key constants stay in the
// owning slice.
import type postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;
export type ReservedConnection = Awaited<ReturnType<Sql['reserve']>>;

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
