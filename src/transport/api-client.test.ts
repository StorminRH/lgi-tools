import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiFetch, type ApiEndpoint } from './api-client';

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
