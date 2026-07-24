import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
  vi.resetAllMocks();
});

describe('serviceFetch', () => {
  it('joins the deployment base URL with the endpoint path', async () => {
    fetchWithTimeout.mockResolvedValue(jsonResponse({ accessToken: 'fresh' }));

    await serviceFetch(bodyEndpoint, { ...init, body: { userId: 'user-1' } });

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://app.test/api/internal/test-token',
      expect.anything(),
    );
  });

  it('sends the service secret as a Bearer credential with the JSON body', async () => {
    fetchWithTimeout.mockResolvedValue(jsonResponse({ accessToken: 'fresh' }));

    await serviceFetch(bodyEndpoint, { ...init, body: { userId: 'user-1' } });

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      expect.any(String),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer service-secret',
        },
        body: JSON.stringify({ userId: 'user-1' }),
      },
    );
  });

  it('omits the body and Content-Type for a request-less endpoint', async () => {
    fetchWithTimeout.mockResolvedValue(jsonResponse({ accessToken: 'fresh' }));

    await serviceFetch(bodylessEndpoint, init);

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://app.test/api/internal/test-status',
      { method: 'GET', headers: { Authorization: 'Bearer service-secret' } },
    );
  });

  it('leaves the shared outbound timeout default in place', async () => {
    fetchWithTimeout.mockResolvedValue(jsonResponse({ accessToken: 'fresh' }));

    await serviceFetch(bodylessEndpoint, init);

    // No third argument — the caller never overrides the shared fail-fast
    // timeout, which is the behavior the bare-fetch call sites had.
    expect(fetchWithTimeout.mock.calls[0]).toHaveLength(2);
  });

  it('returns the validated success body through the declared arm', async () => {
    fetchWithTimeout.mockResolvedValue(jsonResponse({ accessToken: 'fresh' }));

    const outcome = await serviceFetch(bodyEndpoint, {
      ...init,
      body: { userId: 'user-1' },
    });

    expect(outcome).toEqual({ ok: true, status: 200, data: { accessToken: 'fresh' } });
  });

  it('returns a declared problem through its API arm', async () => {
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

    const outcome = await serviceFetch(bodyEndpoint, {
      ...init,
      body: { userId: 'user-1' },
    });

    expect(outcome).toMatchObject({ ok: false, kind: 'api', status: 404 });
  });

  it('rejects a success body that fails the endpoint contract', async () => {
    fetchWithTimeout.mockResolvedValue(jsonResponse({ accessToken: 42 }));

    const outcome = await serviceFetch(bodyEndpoint, {
      ...init,
      body: { userId: 'user-1' },
    });

    expect(outcome).toMatchObject({ ok: false, kind: 'protocol', status: 200 });
  });

  it('rejects an undeclared status as protocol drift', async () => {
    fetchWithTimeout.mockResolvedValue(jsonResponse({ accessToken: 'fresh' }, 502));

    const outcome = await serviceFetch(bodyEndpoint, {
      ...init,
      body: { userId: 'user-1' },
    });

    expect(outcome).toMatchObject({ ok: false, kind: 'protocol', status: 502 });
  });

  it('returns the network arm instead of throwing when the request rejects', async () => {
    const cause = new TypeError('Failed to fetch');
    fetchWithTimeout.mockRejectedValue(cause);

    await expect(serviceFetch(bodylessEndpoint, init)).resolves.toEqual({
      ok: false,
      kind: 'network',
      aborted: false,
      cause,
    });
  });

  it('flags an aborted request on the network arm', async () => {
    fetchWithTimeout.mockRejectedValue(new DOMException('signal timed out', 'AbortError'));

    await expect(serviceFetch(bodylessEndpoint, init)).resolves.toMatchObject({
      ok: false,
      kind: 'network',
      aborted: true,
    });
  });

  it('returns the network arm when the response body stream fails', async () => {
    const response = jsonResponse({ accessToken: 'fresh' });
    vi.spyOn(response, 'json').mockRejectedValue(new TypeError('stream failed'));
    fetchWithTimeout.mockResolvedValue(response);

    await expect(serviceFetch(bodylessEndpoint, init)).resolves.toMatchObject({
      ok: false,
      kind: 'network',
    });
  });
});
