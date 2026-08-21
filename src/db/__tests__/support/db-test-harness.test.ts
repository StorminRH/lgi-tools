import { describe, expect, it } from 'vitest';
import { probeHarnessDatabase } from './db-test-harness';

describe('probeHarnessDatabase', () => {
  it('fails closed when DATABASE_URL is set but Postgres does not answer', async () => {
    await expect(
      probeHarnessDatabase('postgres://postgres:postgres@127.0.0.1:1/postgres'),
    ).rejects.toThrow(/DATABASE_URL is set but Postgres did not accept a connection/);
  });
});
