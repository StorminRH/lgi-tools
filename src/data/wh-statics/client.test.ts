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
    await expect(loadSystemStatics(31_000_002)).rejects.toThrow(
      'system statics network',
    );
  });

  it('shares pending requests per system and retries after a failure', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: false,
      kind: 'network',
      aborted: false,
      cause: new Error('offline'),
    } as never);
    await expect(loadSystemStatics(31_000_003)).rejects.toThrow();
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { statics: ['C247'] },
      headers: new Headers(),
    } as never);
    const [first, second] = await Promise.all([
      loadSystemStatics(31_000_003),
      loadSystemStatics(31_000_003),
    ]);
    expect(first).toEqual(['C247']);
    expect(second).toBe(first);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    { systemId: 31_000_004, previous: ['B274'] },
    { systemId: 31_000_005, previous: [] },
  ])('refreshes a completed result for $systemId on the next load', async ({ systemId, previous }) => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { statics: previous },
      headers: new Headers(),
    } as never);
    await expect(loadSystemStatics(systemId)).resolves.toEqual(previous);

    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { statics: ['C247'] },
      headers: new Headers(),
    } as never);
    await expect(loadSystemStatics(systemId)).resolves.toEqual(['C247']);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });
});
