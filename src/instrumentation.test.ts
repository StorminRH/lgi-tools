import { afterEach, expect, test, vi } from 'vitest';

const afterMock = vi.hoisted(() => vi.fn());
vi.mock('next/server', () => ({ after: afterMock }));

import { registerAfterResponseWork, registerNeonColdStartTelemetry } from '@/instrumentation.node';
import { register } from '@/instrumentation';
import { deferWork, setWorkDeferrer } from '@/lib/deferred-work';

afterEach(() => {
  setWorkDeferrer(null);
  afterMock.mockReset();
  vi.unstubAllEnvs();
});

test('pins leftover runtime exports on the test graph', () => {
  expect([registerNeonColdStartTelemetry, registerAfterResponseWork, register]).not.toContain(undefined);
});

test('register installs a deferrer that hands work to after() in a request and runs it now outside one', async () => {
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  await register();
  const deferred = vi.fn(async () => {});

  await deferWork(deferred);

  expect(afterMock).toHaveBeenCalledWith(deferred);
  expect(deferred).not.toHaveBeenCalled();

  afterMock.mockReset();
  afterMock.mockImplementation(() => {
    throw new Error('`after` was called outside a request scope.');
  });
  const immediate = vi.fn(async () => {});

  await deferWork(immediate);

  expect(immediate).toHaveBeenCalledOnce();
});
