import { afterEach, expect, test, vi } from 'vitest';

const afterMock = vi.hoisted(() => vi.fn());
vi.mock('next/server', () => ({ after: afterMock }));

import { registerAfterResponseWork, registerNeonColdStartTelemetry } from '@/instrumentation.node';
import { register } from '@/instrumentation';
import { deferWork, setWorkDeferrer } from '@/lib/deferred-work';

afterEach(() => {
  setWorkDeferrer(null);
  afterMock.mockReset();
});

test('pins leftover runtime exports on the test graph', () => {
  expect([registerNeonColdStartTelemetry, registerAfterResponseWork, register]).not.toContain(undefined);
});

test('defers work through after() inside a request scope', async () => {
  registerAfterResponseWork();
  const task = vi.fn(async () => {});

  await deferWork(task);

  expect(afterMock).toHaveBeenCalledWith(task);
  expect(task).not.toHaveBeenCalled();
});

test('runs work now when after() refuses because there is no request scope', async () => {
  afterMock.mockImplementation(() => {
    throw new Error('`after` was called outside a request scope.');
  });
  registerAfterResponseWork();
  const task = vi.fn(async () => {});

  await deferWork(task);

  expect(task).toHaveBeenCalledOnce();
});

test('register installs the after-response deferrer on the Node runtime', async () => {
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  try {
    await register();
    const task = vi.fn(async () => {});

    await deferWork(task);

    expect(afterMock).toHaveBeenCalledWith(task);
  } finally {
    vi.unstubAllEnvs();
  }
});
