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

  it('shares pending requests per system and retries after a failure', async () => {
    apiFetchMock.mockResolvedValueOnce(offline);
    await expect(loadSystemStatics(31_000_003)).rejects.toThrow();
    apiFetchMock.mockResolvedValueOnce(promoted(['C247']));
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
    apiFetchMock.mockResolvedValueOnce(promoted(previous));
    await expect(loadSystemStatics(systemId)).resolves.toEqual(previous);

    apiFetchMock.mockResolvedValueOnce(promoted(['C247']));
    await expect(loadSystemStatics(systemId)).resolves.toEqual(['C247']);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });
});
