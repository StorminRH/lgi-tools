import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logUsageEventMock = vi.fn();
vi.mock('./queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

import { cronLogger } from './cron-logger';

describe('cronLogger', () => {
  beforeEach(() => {
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes a scoped boundary line and the usage row under the given action', async () => {
    const log = cronLogger('cron:example', 'cron_sde');
    await log({ outcome: 'refreshed', durationMs: 12 });
    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({ scope: 'cron:example', outcome: 'refreshed', durationMs: 12 }),
    );
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_sde',
      metadata: { outcome: 'refreshed', durationMs: 12 },
    });
  });

  it('swallows a telemetry write failure so it never breaks the cron', async () => {
    logUsageEventMock.mockRejectedValue(new Error('db down'));
    const log = cronLogger('cron:example', 'cron_gsc');
    await expect(log({ outcome: 'busy' })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      '[cron:example] telemetry write failed',
      expect.any(Error),
    );
  });
});
