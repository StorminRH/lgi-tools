import { afterEach, describe, expect, it, vi } from 'vitest';

const POOLED =
  'postgres://u:p@ep-x-123456-pooler.us-east-2.aws.neon.tech/db?sslmode=require';
const DIRECT =
  'postgres://u:p@ep-x-123456.us-east-2.aws.neon.tech/db?sslmode=require';

const { postgresMock } = vi.hoisted(() => ({ postgresMock: vi.fn(() => ({})) }));
vi.mock('postgres', () => ({ default: postgresMock }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  postgresMock.mockClear();
});

describe('directClient wiring (lock-holder connection)', () => {
  it('constructs on the unpooled endpoint via resolveLockConnectionUrl', async () => {
    vi.stubEnv('DATABASE_URL', POOLED);
    vi.stubEnv('DATABASE_URL_UNPOOLED', DIRECT);
    const { directClient } = await import('./index');
    void directClient.reserve;
    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(postgresMock).toHaveBeenCalledWith(DIRECT, expect.anything());
  });

  it('fails closed when only a pooled connection is configured', async () => {
    vi.stubEnv('DATABASE_URL', POOLED);
    vi.stubEnv('DATABASE_URL_UNPOOLED', undefined);
    const { directClient } = await import('./index');
    expect(() => void directClient.reserve).toThrow(/-pooler/);
    expect(postgresMock).not.toHaveBeenCalled();
  });
});
