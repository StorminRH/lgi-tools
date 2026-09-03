import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaveSyncDoorError, postLeaveSync } from './leave-door';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud');
  vi.stubEnv('CONVEX_SERVICE_SECRET', 'svc-secret');
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  fetchSpy.mockResolvedValue(
    new Response(JSON.stringify({ retired: true }), { status: 200 }),
  );
});

afterEach(() => {
  fetchSpy.mockRestore();
  vi.unstubAllEnvs();
});

describe('postLeaveSync', () => {
  it('POSTs the verified user and tab to /leave-sync with the bearer secret', async () => {
    await expect(
      postLeaveSync({
        userId: 'user-1',
        dataset: 'characterLocation',
        tabId: 'tab-aaaa-bbbb',
      }),
    ).resolves.toEqual({ retired: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://example.convex.site/leave-sync');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer svc-secret');
    expect(JSON.parse(init?.body as string)).toEqual({
      userId: 'user-1',
      dataset: 'characterLocation',
      tabId: 'tab-aaaa-bbbb',
    });
  });

  it('throws when Convex answers a non-2xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('no', { status: 503 }));
    await expect(
      postLeaveSync({
        userId: 'user-1',
        dataset: 'characterLocation',
        tabId: 'tab-aaaa-bbbb',
      }),
    ).rejects.toBeInstanceOf(LeaveSyncDoorError);
  });
});
