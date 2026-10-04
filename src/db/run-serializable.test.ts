import { sql } from 'drizzle-orm';
import { afterEach, expect, test, vi } from 'vitest';

const NEON_URL = 'postgres://u:p@ep-x-123456.us-east-2.aws.neon.tech/db?sslmode=require';

const h = vi.hoisted(() => ({
  transaction: vi.fn(),
  query: vi.fn((text: string, params: unknown[]) => ({ text, params })),
}));

vi.mock('@neondatabase/serverless', () => ({
  neon: () => Object.assign(() => undefined, { transaction: h.transaction }),
  neonConfig: {},
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  h.transaction.mockReset();
});

test("over Neon's HTTP driver one statement runs serializably in a single request", async () => {
  vi.stubEnv('LOCAL_DB_DRIVER', '');
  vi.stubEnv('DATABASE_URL', NEON_URL);
  h.transaction.mockImplementation(async (build: (tx: { query: typeof h.query }) => unknown[]) => {
    expect(build({ query: h.query })).toEqual([{ text: 'insert into t select $1 where $2 < 3 returning id', params: ['a', 2] }]);
    return [[{ id: 'a' }]];
  });
  const { runSerializable } = await import('./index');
  await expect(runSerializable(sql`insert into t select ${'a'} where ${2} < 3 returning id`)).resolves.toEqual([{ id: 'a' }]);
  expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
});

test('a statement that returns nothing reads as no rows', async () => {
  vi.stubEnv('LOCAL_DB_DRIVER', '');
  vi.stubEnv('DATABASE_URL', NEON_URL);
  h.transaction.mockResolvedValue([]);
  const { runSerializable } = await import('./index');
  await expect(runSerializable(sql`select 1 where false`)).resolves.toEqual([]);
});
