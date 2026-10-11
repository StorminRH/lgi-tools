import { expect, test, vi } from 'vitest';
import { silenceConsolePrefixes } from './__tests__/console-tags';

const afterMock = vi.hoisted(() => vi.fn());
vi.mock('next/server', () => ({ after: afterMock }));

import { runAfterResponse } from './after-response';

test('runs the work only when after() calls back, and logs a rejection under its scope without rethrowing', async () => {
  afterMock.mockReset();
  const logged = silenceConsolePrefixes('error', ['[ledger] entry write failed']);
  const error = new Error('database unavailable');
  const task = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);

  runAfterResponse('ledger', 'entry', task);
  runAfterResponse('ledger', 'entry', task);

  expect(afterMock).toHaveBeenCalledTimes(2);
  expect(task).not.toHaveBeenCalled();
  await expect(afterMock.mock.calls[0]![0]()).resolves.toBeUndefined();
  expect(task).toHaveBeenCalledOnce();
  expect(logged).not.toHaveBeenCalled();

  await expect(afterMock.mock.calls[1]![0]()).resolves.toBeUndefined();
  expect(task).toHaveBeenCalledTimes(2);
  expect(logged).toHaveBeenCalledExactlyOnceWith('[ledger] entry write failed', error);
  logged.mockRestore();
});

test('drops the work and logs when after() refuses outside a request scope', () => {
  const error = new Error('`after` was called outside a request scope.');
  afterMock.mockReset().mockImplementation(() => {
    throw error;
  });
  const logged = silenceConsolePrefixes('error', ['[ledger] entry scheduling failed']);
  const task = vi.fn(async () => {});

  expect(() => runAfterResponse('ledger', 'entry', task)).not.toThrow();

  expect(logged).toHaveBeenCalledExactlyOnceWith('[ledger] entry scheduling failed', error);
  expect(task).not.toHaveBeenCalled();
  logged.mockRestore();
});
