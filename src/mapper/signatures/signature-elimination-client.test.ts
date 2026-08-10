import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ apiFetch: vi.fn(), success: vi.fn() }));

vi.mock('@/transport/api-client', () => ({
  apiFetch: (...args: unknown[]) => h.apiFetch(...args),
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { success: (...args: unknown[]) => h.success(...args) },
}));

import { signatureEliminationEndpoint } from '@/data/maps/api-contract';
import { eliminateSignaturesAndAnnounce } from './signature-elimination-client';

beforeEach(() => {
  h.apiFetch.mockReset();
  h.success.mockReset();
});

describe('signature elimination client', () => {
  it('posts identifiers and toasts only a positive applied result', async () => {
    h.apiFetch.mockResolvedValueOnce({
      ok: true,
      data: { status: 'applied', deduced: 2 },
    });
    await expect(
      eliminateSignaturesAndAnnounce({ mapId: 'map-1', systemId: 31_000_001 }),
    ).resolves.toEqual({ status: 'applied', deduced: 2 });
    expect(h.apiFetch).toHaveBeenCalledWith(
      signatureEliminationEndpoint,
      expect.objectContaining({
        body: { mapId: 'map-1', systemId: 31_000_001 },
        signal: expect.anything(),
      }),
    );
    expect(h.success).toHaveBeenCalledWith(
      '2 signatures identified by elimination.',
      { id: 'signature-elimination:map-1:31000001' },
    );

    h.apiFetch.mockResolvedValueOnce({ ok: true, data: { status: 'quiet' } });
    await eliminateSignaturesAndAnnounce({ mapId: 'map-1', systemId: 31_000_001 });
    expect(h.success).toHaveBeenCalledTimes(1);
  });

  it('returns null without a toast when transport fails', async () => {
    h.apiFetch.mockResolvedValueOnce({ ok: false });
    await expect(
      eliminateSignaturesAndAnnounce({ mapId: 'map-1', systemId: 31_000_001 }),
    ).resolves.toBeNull();
    expect(h.success).not.toHaveBeenCalled();
  });
});
