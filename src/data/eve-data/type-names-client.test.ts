import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/transport/api-client', () => ({
  apiFetch: apiFetchMock,
}));

import { loadTypeNames } from './type-names-client';

describe('loadTypeNames', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('returns an empty record without fetching when no positive ids remain', async () => {
    await expect(loadTypeNames([])).resolves.toEqual({});
    await expect(loadTypeNames([0, -7])).resolves.toEqual({});
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('posts unique positive ids and returns the named record', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { names: { '587': 'Rifter', '670': 'Capsule' } },
    });

    await expect(loadTypeNames([670, 587, 587])).resolves.toEqual({
      '587': 'Rifter',
      '670': 'Capsule',
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/eve/type-names' }),
      { body: { ids: [587, 670] } },
    );
  });

  it('surfaces a failed type-names fetch', async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      kind: 'api',
      status: 500,
      error: {},
    });

    await expect(loadTypeNames([587])).rejects.toThrow('type names 500');
  });
});
