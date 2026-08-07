import { describe, expect, it, vi } from 'vitest';
import { postJumpRequest } from './jump-client';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('@/transport/api-client', () => ({
  apiFetch: (...args: unknown[]) => mocks.apiFetch(...args),
}));

describe('postJumpRequest', () => {
  it('bounds every ring with an abort timeout so a hung POST stays retryable', async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ok: true, data: { status: 'processed' } });
    await expect(
      postJumpRequest({ kind: 'doorbell', mapId: 'map-a', characterId: 1 }),
    ).resolves.toEqual({ status: 'processed' });
    const init = mocks.apiFetch.mock.calls[0]?.[1] as { signal?: unknown };
    expect(init.signal).toBeInstanceOf(AbortSignal);

    mocks.apiFetch.mockResolvedValueOnce({ ok: false });
    await expect(
      postJumpRequest({ kind: 'doorbell', mapId: 'map-a', characterId: 1 }),
    ).resolves.toBeNull();
  });
});
