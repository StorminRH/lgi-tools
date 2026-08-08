import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/transport/api-client';
import { loadSystemStatics } from './client';

vi.mock('@/transport/api-client', () => ({ apiFetch: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);

describe('system statics client', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('returns promoted codes and keeps an outage explicit for search-only degradation', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { statics: ['B274'] },
      headers: new Headers(),
    } as never);
    await expect(loadSystemStatics(31_000_001)).resolves.toEqual(['B274']);

    apiFetchMock.mockResolvedValueOnce({
      ok: false,
      kind: 'network',
      aborted: false,
      cause: new Error('offline'),
    } as never);
    await expect(loadSystemStatics(31_000_001)).rejects.toThrow(
      'system statics network',
    );
  });
});
