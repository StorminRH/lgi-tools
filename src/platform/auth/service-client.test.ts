import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { problemBodySchema } from '@/lib/problem';
import { defineEndpoint, jsonBody, problem } from '@/transport/endpoint';
import { serviceFetch } from './service-client';

const fetchWithTimeout = vi.hoisted(() => vi.fn());
vi.mock('@/lib/fetch-with-timeout', () => ({ fetchWithTimeout }));

const tokenSchema = z.object({ accessToken: z.string() });

const bodyEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/internal/test-token',
  request: z.object({ userId: z.string() }),
  responses: {
    200: jsonBody(tokenSchema),
    404: problem('not_found'),
  },
});

const bodylessEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/internal/test-status',
  request: null,
  responses: {
    200: jsonBody(tokenSchema),
  },
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const init = { baseUrl: 'https://app.test', secret: 'service-secret' };

beforeEach(() => {
  vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', '');
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

test('sends a JSON body request with bearer auth and returns the declared success arm', async () => {
  fetchWithTimeout.mockResolvedValue(jsonResponse({ accessToken: 'fresh' }));

  const outcome = await serviceFetch(bodyEndpoint, {
    ...init,
    body: { userId: 'user-1' },
  });

  expect(outcome).toEqual({ ok: true, status: 200, data: { accessToken: 'fresh' } });
  expect(fetchWithTimeout).toHaveBeenCalledWith('https://app.test/api/internal/test-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer service-secret',
    },
    body: JSON.stringify({ userId: 'user-1' }),
  });
  expect(fetchWithTimeout.mock.calls[0]).toHaveLength(2);
});

test('omits the body for a request-less endpoint and attaches the Vercel bypass header when set', async () => {
  fetchWithTimeout.mockResolvedValue(jsonResponse({ accessToken: 'fresh' }));

  await serviceFetch(bodylessEndpoint, init);
  expect(fetchWithTimeout).toHaveBeenCalledWith('https://app.test/api/internal/test-status', {
    method: 'GET',
    headers: { Authorization: 'Bearer service-secret' },
  });

  fetchWithTimeout.mockClear();
  vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'bypass-secret');
  fetchWithTimeout.mockResolvedValue(jsonResponse({ accessToken: 'fresh' }));

  await serviceFetch(bodylessEndpoint, init);
  expect(fetchWithTimeout).toHaveBeenCalledWith('https://app.test/api/internal/test-status', {
    method: 'GET',
    headers: {
      Authorization: 'Bearer service-secret',
      'x-vercel-protection-bypass': 'bypass-secret',
    },
  });
});

test('classifies API, protocol, and network failures without throwing', async () => {
  fetchWithTimeout.mockResolvedValue(
    jsonResponse(
      problemBodySchema.parse({
        type: 'https://lgi.tools/problems/not-found',
        title: 'Not found',
        status: 404,
        code: 'not_found',
        correlationId: 'correlation-id',
      }),
      404,
    ),
  );
  await expect(
    serviceFetch(bodyEndpoint, { ...init, body: { userId: 'user-1' } }),
  ).resolves.toMatchObject({ ok: false, kind: 'api', status: 404 });

  fetchWithTimeout.mockResolvedValue(jsonResponse({ accessToken: 42 }));
  await expect(
    serviceFetch(bodyEndpoint, { ...init, body: { userId: 'user-1' } }),
  ).resolves.toMatchObject({ ok: false, kind: 'protocol', status: 200 });

  fetchWithTimeout.mockResolvedValue(jsonResponse({ accessToken: 'fresh' }, 502));
  await expect(
    serviceFetch(bodyEndpoint, { ...init, body: { userId: 'user-1' } }),
  ).resolves.toMatchObject({ ok: false, kind: 'protocol', status: 502 });

  const cause = new TypeError('Failed to fetch');
  fetchWithTimeout.mockRejectedValue(cause);
  await expect(serviceFetch(bodylessEndpoint, init)).resolves.toEqual({
    ok: false,
    kind: 'network',
    aborted: false,
    cause,
  });

  fetchWithTimeout.mockRejectedValue(new DOMException('signal timed out', 'AbortError'));
  await expect(serviceFetch(bodylessEndpoint, init)).resolves.toMatchObject({
    ok: false,
    kind: 'network',
    aborted: true,
  });

  const response = jsonResponse({ accessToken: 'fresh' });
  vi.spyOn(response, 'json').mockRejectedValue(new TypeError('stream failed'));
  fetchWithTimeout.mockResolvedValue(response);
  await expect(serviceFetch(bodylessEndpoint, init)).resolves.toMatchObject({
    ok: false,
    kind: 'network',
  });
});
