import { afterEach, expect, test, vi } from 'vitest';

const POOLED =
  'postgres://u:p@ep-x-123456-pooler.us-east-2.aws.neon.tech/db?sslmode=require';
const DIRECT =
  'postgres://u:p@ep-x-123456.us-east-2.aws.neon.tech/db?sslmode=require';

const { postgresMock } = vi.hoisted(() => ({
  postgresMock: vi.fn(() => ({ options: { parsers: {}, serializers: {} } })),
}));
vi.mock('postgres', () => ({ default: postgresMock }));

function configureDatabaseUrls(pooled: string, unpooled: string | undefined): void {
  vi.stubEnv('LGI_DATABASE_URL_UNPOOLED', undefined);
  vi.stubEnv('LGI_DATABASE_URL', undefined);
  vi.stubEnv('DATABASE_URL', pooled);
  vi.stubEnv('DATABASE_URL_UNPOOLED', unpooled);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  postgresMock.mockClear();
});

test('builds one Drizzle instance over the unpooled endpoint on first use', async () => {
  configureDatabaseUrls(POOLED, DIRECT);
  const { directDatabase } = await import('./direct-database');
  expect(postgresMock).not.toHaveBeenCalled();

  const first = directDatabase();
  const second = directDatabase();

  expect(second).toBe(first);
  expect(postgresMock).toHaveBeenCalledTimes(1);
  expect(postgresMock).toHaveBeenCalledWith(DIRECT, expect.anything());
});

test('refuses a pooled-only configuration on the first call, not at import', async () => {
  configureDatabaseUrls(POOLED, undefined);
  const { directDatabase } = await import('./direct-database');

  expect(() => directDatabase()).toThrow(/-pooler/);
  expect(postgresMock).not.toHaveBeenCalled();
});
