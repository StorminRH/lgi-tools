import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { postBeacon } from './beacon';
import { defineEndpoint, emptyBody } from './endpoint';

afterEach(() => {
  vi.unstubAllGlobals();
});

const pingEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/test/ping',
  request: z.object({ tabId: z.string(), count: z.number() }),
  responses: { 204: emptyBody() },
});

function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

test('a queued beacon posts the JSON body to the endpoint path and skips fetch', async () => {
  const sendBeacon = vi.fn<(url: string, data?: Blob) => boolean>(() => true);
  vi.stubGlobal('navigator', { sendBeacon });
  const fetchMock = stubFetch();

  postBeacon(pingEndpoint, { tabId: 'tab-1', count: 2 });

  expect(sendBeacon).toHaveBeenCalledTimes(1);
  const [path, blob] = sendBeacon.mock.calls[0] ?? [];
  expect(path).toBe('/api/test/ping');
  expect(blob).toBeInstanceOf(Blob);
  expect(blob?.type).toBe('application/json');
  expect(JSON.parse((await blob?.text()) ?? '')).toEqual({ tabId: 'tab-1', count: 2 });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a refused beacon falls back to a keepalive POST of the same body', () => {
  const sendBeacon = vi.fn<(url: string, data?: Blob) => boolean>(() => false);
  vi.stubGlobal('navigator', { sendBeacon });
  const fetchMock = stubFetch();

  postBeacon(pingEndpoint, { tabId: 'tab-1', count: 2 });

  expect(sendBeacon).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('/api/test/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"tabId":"tab-1","count":2}',
    keepalive: true,
  });
});

test.each([
  ['there is no navigator', undefined],
  ['the navigator has no sendBeacon', {}],
])('falls back to a keepalive POST when %s', (_case, navigatorStub) => {
  vi.stubGlobal('navigator', navigatorStub);
  const fetchMock = stubFetch();

  postBeacon(pingEndpoint, { tabId: 'tab-2', count: 0 });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/test/ping',
    expect.objectContaining({ method: 'POST', body: '{"tabId":"tab-2","count":0}', keepalive: true }),
  );
});
