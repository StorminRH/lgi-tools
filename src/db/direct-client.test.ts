import { afterEach, describe, expect, it, vi } from 'vitest';

// Guards C-1: the lock-holder connection `directClient`
// must resolve its URL through resolveLockConnectionUrl, so it stays fail-closed off
// a pooled (`-pooler`) endpoint even if the connection wiring is later refactored.
// connection.test.ts guards the resolver in isolation; this guards that directClient
// actually goes through it — the gap a wiring change could silently reopen.
//
// `postgres` is mocked so touching the lazy Proxy never opens a real connection: we
// assert which URL the client is constructed with, not that it connects.

const POOLED =
  'postgres://u:p@ep-x-123456-pooler.us-east-2.aws.neon.tech/db?sslmode=require';
const DIRECT =
  'postgres://u:p@ep-x-123456.us-east-2.aws.neon.tech/db?sslmode=require';

const { postgresMock } = vi.hoisted(() => ({ postgresMock: vi.fn(() => ({})) }));
vi.mock('postgres', () => ({ default: postgresMock }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules(); // reset the module-singleton _directClient between cases
  postgresMock.mockClear();
});

describe('directClient wiring (lock-holder connection)', () => {
  it('constructs on the unpooled endpoint via resolveLockConnectionUrl', async () => {
    vi.stubEnv('DATABASE_URL', POOLED);
    vi.stubEnv('DATABASE_URL_UNPOOLED', DIRECT);
    const { directClient } = await import('./index');
    void directClient.reserve; // trigger the lazy Proxy → getDirectClient()
    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(postgresMock).toHaveBeenCalledWith(DIRECT, expect.anything());
  });

  it('fails closed when only a pooled connection is configured', async () => {
    vi.stubEnv('DATABASE_URL', POOLED); // no DATABASE_URL_UNPOOLED
    const { directClient } = await import('./index');
    expect(() => void directClient.reserve).toThrow(/-pooler/);
    expect(postgresMock).not.toHaveBeenCalled(); // threw before constructing
  });
});
