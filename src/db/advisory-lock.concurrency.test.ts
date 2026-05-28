import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveLockConnectionUrl } from './index';

// Proves the advisory lock actually serializes on the direct (unpooled)
// connection the lock holders now use. Two reserved connections are two
// distinct backend sessions; on a stable backend exactly one wins the
// session-scoped lock. (Through `-pooler` this would be flaky — the bug
// 3.0.4.2 fixes.)
//
// Gated on DATABASE_URL so CI (no database) skips it. Run locally against
// the Docker SDE container:
//   DATABASE_URL=postgres://lgi:lgi@localhost:5433/lgi_tools pnpm test
const HAS_DB = Boolean(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);

// Throwaway key, not one of the real ADVISORY_LOCK_* constants.
const TEST_LOCK_KEY = 918273645;

describe.skipIf(!HAS_DB)('advisory lock serialization (direct connection)', () => {
  // Created in beforeAll, not at collection time, so a skipped run (no DB)
  // never calls resolveLockConnectionUrl / opens a connection.
  let client: ReturnType<typeof postgres>;

  beforeAll(() => {
    client = postgres(resolveLockConnectionUrl(), { max: 2 });
  });

  afterAll(async () => {
    await client?.end();
  });

  it('grants the session lock to exactly one of two concurrent holders', async () => {
    const a = await client.reserve();
    const b = await client.reserve();
    try {
      const [[ra], [rb]] = await Promise.all([
        a<{ got: boolean }[]>`SELECT pg_try_advisory_lock(${TEST_LOCK_KEY}) AS got`,
        b<{ got: boolean }[]>`SELECT pg_try_advisory_lock(${TEST_LOCK_KEY}) AS got`,
      ]);
      const winners = [ra.got, rb.got].filter(Boolean);
      expect(winners).toHaveLength(1);
    } finally {
      // Unlock from whichever session(s) hold it, then release.
      await a`SELECT pg_advisory_unlock(${TEST_LOCK_KEY})`;
      await b`SELECT pg_advisory_unlock(${TEST_LOCK_KEY})`;
      a.release();
      b.release();
    }
  });
});
