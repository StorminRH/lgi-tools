import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveLockConnectionUrl } from './index';

const HAS_DB = Boolean(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);

const TEST_LOCK_KEY = 918273645;

describe.skipIf(!HAS_DB)('advisory lock serialization (direct connection)', () => {
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
      const winners = [ra!.got, rb!.got].filter(Boolean);
      expect(winners).toHaveLength(1);
    } finally {
      await a`SELECT pg_advisory_unlock(${TEST_LOCK_KEY})`;
      await b`SELECT pg_advisory_unlock(${TEST_LOCK_KEY})`;
      a.release();
      b.release();
    }
  });
});
