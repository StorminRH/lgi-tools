import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';
import { problemBodySchema } from '@/lib/problem';
import { apiFetch } from './api-client';
import {
  defineEndpoint,
  emptyBody,
  jsonBody,
  problem,
  type OutcomeOf,
} from './endpoint';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const echoSchema = z.object({ value: z.string() });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const typedEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/test/typed',
  request: echoSchema,
  responses: {
    200: jsonBody(echoSchema),
    204: emptyBody(),
    400: problem('invalid_body'),
  },
});

const requestlessEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/test/requestless',
  request: null,
  responses: {
    200: jsonBody(echoSchema),
  },
});

const emptyWireEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/test/empty-wire',
  request: null,
  responses: {
    200: emptyBody(),
  },
});

const detailEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/test/things/[id]',
  request: null,
  params: z.object({ id: z.string() }),
  responses: {
    200: jsonBody(echoSchema),
  },
});

const filteredEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/test/things',
  request: null,
  query: z.object({ kind: z.enum(['a', 'b']).optional() }),
  responses: {
    200: jsonBody(echoSchema),
  },
});

const problemResponseBody = (code = 'invalid_body', status = 400) =>
  problemBodySchema.parse({
    type: 'https://lgi.tools/problems/validation',
    title: 'Invalid request',
    status,
    code,
    correlationId: 'correlation-id',
  });

describe('apiFetch', () => {
  it('sends the same request bytes as the raw call sites it replaced', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch(typedEndpoint, { body: { value: 'hi' } });

    expect(fetchMock).toHaveBeenCalledWith('/api/test/typed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'hi' }),
    });
  });

  it('sends no body or Content-Type for a request-less endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch(requestlessEndpoint);

    expect(fetchMock).toHaveBeenCalledWith('/api/test/requestless', { method: 'GET' });
  });

  it('passes signal/cache/keepalive through to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await apiFetch(typedEndpoint, {
      body: { value: 'hi' },
      cache: 'no-store',
      keepalive: true,
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/test/typed',
      expect.objectContaining({ cache: 'no-store', keepalive: true, signal: controller.signal }),
    );
  });

  it('resolves path parameters and query values into the request URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch(detailEndpoint, { params: { id: '42' } });
    await apiFetch(filteredEndpoint, { query: { kind: 'b' } });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/test/things/42');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/test/things?kind=b');
  });

  it('keeps params and query out of the request init', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch(detailEndpoint, { params: { id: '42' } });

    expect(fetchMock).toHaveBeenCalledWith('/api/test/things/42', { method: 'GET' });
  });

  it('returns raw JSON through the exact declared success arm', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ value: 'ok', extra: 1 })),
    );

    const result = await apiFetch(typedEndpoint, { body: { value: 'request' } });

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: { value: 'ok', extra: 1 },
    });
    if (result.ok && result.status === 200) {
      expectTypeOf(result.data).toEqualTypeOf<{ value: string }>();
    }
  });

  it('returns undefined data for a declared empty success response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const result = await apiFetch(typedEndpoint, { body: { value: 'request' } });

    expect(result).toEqual({
      ok: true,
      status: 204,
      data: undefined,
    });
  });

  it('returns a declared problem through its narrowed API arm', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(problemResponseBody(), 400)),
    );

    const result = await apiFetch(typedEndpoint, { body: { value: 'request' } });

    expect(result).toMatchObject({
      ok: false,
      kind: 'api',
      status: 400,
      error: { code: 'invalid_body' },
    });
    if (!result.ok && result.kind === 'api' && result.status === 400) {
      expectTypeOf(result.error.code).toEqualTypeOf<'invalid_body'>();
    }
  });

  it('rejects undeclared problem extension members as protocol drift', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ ...problemResponseBody(), stack: 'private stack' }, 400),
      ),
    );

    await expect(
      apiFetch(typedEndpoint, { body: { value: 'request' } }),
    ).resolves.toMatchObject({
      ok: false,
      kind: 'protocol',
      status: 400,
    });
  });

  it.each(['development', 'production'] as const)(
    'returns protocol failure for response drift in %s',
    async (nodeEnv) => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ value: 123 })),
      );

      const result = await apiFetch(typedEndpoint, { body: { value: 'request' } });

      expect(result).toMatchObject({
        ok: false,
        kind: 'protocol',
        status: 200,
      });
    },
  );

  it('returns protocol failure for undeclared status, invalid JSON, and code drift', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ value: 'ok' }, 201))
      .mockResolvedValueOnce(new Response('not json', { status: 400 }))
      .mockResolvedValueOnce(
        jsonResponse(problemResponseBody('different_code'), 400),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiFetch(typedEndpoint, { body: { value: 'request' } }),
    ).resolves.toMatchObject({ ok: false, kind: 'protocol', status: 201 });
    await expect(
      apiFetch(typedEndpoint, { body: { value: 'request' } }),
    ).resolves.toMatchObject({ ok: false, kind: 'protocol', status: 400 });
    await expect(
      apiFetch(typedEndpoint, { body: { value: 'request' } }),
    ).resolves.toMatchObject({ ok: false, kind: 'protocol', status: 400 });
  });

  it('treats a body on an empty codec as protocol drift', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('unexpected body', { status: 200 })),
    );

    await expect(apiFetch(emptyWireEndpoint)).resolves.toMatchObject({
      ok: false,
      kind: 'protocol',
      status: 200,
    });
  });

  it('returns explicit network and abort arms instead of throwing', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch(requestlessEndpoint)).resolves.toMatchObject({
      ok: false,
      kind: 'network',
      aborted: false,
    });
    await expect(apiFetch(requestlessEndpoint)).resolves.toMatchObject({
      ok: false,
      kind: 'network',
      aborted: true,
    });
  });

  it('returns a network arm when the response body stream fails', async () => {
    const response = new Response('body', { status: 200 });
    vi.spyOn(response, 'text').mockRejectedValue(new TypeError('stream failed'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(apiFetch(emptyWireEndpoint)).resolves.toMatchObject({
      ok: false,
      kind: 'network',
      aborted: false,
    });
  });

  it('returns a network arm when JSON or problem body streams fail', async () => {
    const json = jsonResponse({ value: 'ok' });
    const problemBody = jsonResponse(problemResponseBody(), 400);
    vi.spyOn(json, 'json').mockRejectedValue(new TypeError('json stream failed'));
    vi.spyOn(problemBody, 'json').mockRejectedValue(
      new TypeError('problem stream failed'),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(json).mockResolvedValueOnce(problemBody),
    );

    await expect(
      apiFetch(typedEndpoint, { body: { value: 'request' } }),
    ).resolves.toMatchObject({
      ok: false,
      kind: 'network',
      aborted: false,
    });
    await expect(
      apiFetch(typedEndpoint, { body: { value: 'request' } }),
    ).resolves.toMatchObject({
      ok: false,
      kind: 'network',
      aborted: false,
    });
  });

  it('requires and rejects call arguments from the endpoint contract', () => {
    if (false) {

      apiFetch(typedEndpoint);

      apiFetch(requestlessEndpoint, { body: { value: 'no' } });

      apiFetch(typedEndpoint, { body: { value: 42 } });

      apiFetch(detailEndpoint);

      apiFetch(detailEndpoint, { params: { slug: '1' } });

      apiFetch(filteredEndpoint, { query: { other: 'x' } });
    }
    expectTypeOf<{
      ok: false;
      kind: 'protocol';
      status: number;
      detail: string;
    }>().toExtend<OutcomeOf<typeof typedEndpoint>>();
    expectTypeOf<{
      ok: false;
      kind: 'network';
      aborted: boolean;
      cause: unknown;
    }>().toExtend<OutcomeOf<typeof typedEndpoint>>();
  });
});
