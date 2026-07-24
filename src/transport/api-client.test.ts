import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';
import { problemBodySchema } from '@/lib/problem';
import { apiFetch, type ApiEndpoint } from './api-client';
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

const postEndpoint: ApiEndpoint<z.input<typeof echoSchema>, z.infer<typeof echoSchema>> = {
  method: 'POST',
  path: '/api/test/echo',
  request: echoSchema,
  response: echoSchema,
};

const getEndpoint: ApiEndpoint<null, z.infer<typeof echoSchema>> = {
  method: 'GET',
  path: '/api/test/echo',
  request: null,
  response: echoSchema,
};

const fireAndForgetEndpoint: ApiEndpoint<z.input<typeof echoSchema>, undefined> = {
  method: 'POST',
  path: '/api/test/beacon',
  request: echoSchema,
  response: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('apiFetch', () => {
  it('sends the same request bytes as the raw call sites it replaced', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch(postEndpoint, { body: { value: 'hi' } });

    expect(fetchMock).toHaveBeenCalledWith('/api/test/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'hi' }),
    });
  });

  it('sends no body or Content-Type for a request-less endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch(getEndpoint);

    expect(fetchMock).toHaveBeenCalledWith('/api/test/echo', { method: 'GET' });
  });

  it('passes signal/cache/keepalive through to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await apiFetch(postEndpoint, {
      body: { value: 'hi' },
      cache: 'no-store',
      keepalive: true,
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/test/echo',
      expect.objectContaining({ cache: 'no-store', keepalive: true, signal: controller.signal }),
    );
  });

  it('returns the parsed body as data on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' })));

    const result = await apiFetch(getEndpoint);

    expect(result).toEqual({ ok: true, status: 200, data: { value: 'ok' } });
  });

  it('returns the RAW json, never the Zod output (no key-stripping)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ value: 'ok', extra: 1 })),
    );

    const result = await apiFetch(getEndpoint);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ value: 'ok', extra: 1 });
  });

  it('does not read the body when the endpoint declares response: null', async () => {
    const res = new Response(null, { status: 204 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));

    const result = await apiFetch(fireAndForgetEndpoint, { body: { value: 'hi' } });

    expect(result).toEqual({ ok: true, status: 204, data: undefined });
    expect(res.bodyUsed).toBe(false);
  });

  it('warns (but still returns the body) when a response drifts outside production', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ value: 123 })));

    const result = await apiFetch(getEndpoint);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ value: 123 });
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it('returns the unconsumed Response on a non-2xx status', async () => {
    const res = new Response('email: Invalid email', { status: 400 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));

    const result = await apiFetch(postEndpoint, { body: { value: 'hi' } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.response.bodyUsed).toBe(false);
      // Callers keep their existing .text() error branches.
      await expect(result.response.text()).resolves.toBe('email: Invalid email');
    }
  });

  it('propagates network rejections exactly like raw fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(apiFetch(getEndpoint)).rejects.toThrowError('Failed to fetch');
  });
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

const problemResponseBody = (code = 'invalid_body', status = 400) =>
  problemBodySchema.parse({
    type: 'https://lgi.tools/problems/validation',
    title: 'Invalid request',
    status,
    code,
    correlationId: 'correlation-id',
  });

describe('apiFetch v2', () => {
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

  it('requires and rejects request bodies from the endpoint contract', () => {
    if (false) {
      // @ts-expect-error Body endpoints require their schema-derived input.
      apiFetch(typedEndpoint);
      // @ts-expect-error Requestless endpoints cannot accept a body.
      apiFetch(requestlessEndpoint, { body: { value: 'no' } });
      // @ts-expect-error The request body must satisfy the endpoint schema input.
      apiFetch(typedEndpoint, { body: { value: 42 } });
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
