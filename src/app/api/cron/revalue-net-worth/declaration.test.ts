import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalueAllNetWorth = vi.hoisted(() => vi.fn());
vi.mock('@/composition/board/net-worth-nightly', () => ({ revalueAllNetWorth }));

import { revalueNetWorthDeclaration } from './declaration';

const context = { client: {} as never, record: async () => {} };

beforeEach(() => {
  revalueAllNetWorth.mockReset();
});

describe('revalueNetWorthDeclaration', () => {
  it('reports revalued accounts as work done, within a one-minute budget', async () => {
    const summary = { accounts: 2, revalued: 2, failed: 0, deferred: 0 };
    revalueAllNetWorth.mockResolvedValue(summary);
    const started = Date.now();
    const outcome = await revalueNetWorthDeclaration.work(context, undefined);
    expect(outcome).toEqual({ outcome: 'revalued', workDone: true, failed: false, telemetry: summary, body: summary });
    const deadline = revalueAllNetWorth.mock.calls[0]![0] as number;
    expect(deadline - started).toBeGreaterThanOrEqual(60_000);
    expect(deadline - Date.now()).toBeLessThanOrEqual(60_000);
  });

  it('marks a run with a failed account partial so the batch step reports it', async () => {
    revalueAllNetWorth.mockResolvedValue({ accounts: 2, revalued: 1, failed: 1, deferred: 0 });
    await expect(revalueNetWorthDeclaration.work(context, undefined)).resolves.toMatchObject({
      outcome: 'partial',
      workDone: true,
      failed: true,
    });
  });

  it('is idle with no linked account', async () => {
    revalueAllNetWorth.mockResolvedValue({ accounts: 0, revalued: 0, failed: 0, deferred: 0 });
    await expect(revalueNetWorthDeclaration.work(context, undefined)).resolves.toMatchObject({
      outcome: 'revalued',
      workDone: false,
    });
  });
});
