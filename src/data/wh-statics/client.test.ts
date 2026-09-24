import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/transport/api-client';
import { loadSystemStatics } from './client';

vi.mock('@/transport/api-client', () => ({ apiFetch: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);

const promoted = (statics: string[]) => ({
  ok: true,
  status: 200,
  data: { statics },
  headers: new Headers(),
}) as never;

const offline = {
  ok: false,
  kind: 'network',
  aborted: false,
  cause: new Error('offline'),
} as never;

describe('system statics client', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('returns promoted codes and keeps an outage explicit for search-only degradation', async () => {
    apiFetchMock.mockResolvedValueOnce(promoted(['B274']));
    await expect(loadSystemStatics(31_000_001)).resolves.toEqual(['B274']);

    apiFetchMock.mockResolvedValueOnce(offline);
    await expect(loadSystemStatics(31_000_002)).rejects.toThrow(
      'system statics network',
    );
  });

  it('shares one request per system and retries a failed lookup', async () => {
    apiFetchMock.mockResolvedValueOnce(promoted(['C247']));
    const [first, second] = await Promise.all([
      loadSystemStatics(31_000_003),
      loadSystemStatics(31_000_003),
    ]);
    expect(first).toEqual(['C247']);
    expect(second).toBe(first);
    await loadSystemStatics(31_000_003);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    apiFetchMock.mockResolvedValueOnce(offline);
    await expect(loadSystemStatics(31_000_004)).rejects.toThrow();
    apiFetchMock.mockResolvedValueOnce(promoted(['N062']));
    await expect(loadSystemStatics(31_000_004)).resolves.toEqual(['N062']);
  });
});
