import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  deriveConvexSiteUrl: vi.fn(),
  readEnv: vi.fn(),
}));

vi.mock('@/lib/fetch-with-timeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => h.fetchWithTimeout(...args),
}));
vi.mock('@/lib/sync-engine', () => ({
  deriveConvexSiteUrl: (...args: unknown[]) => h.deriveConvexSiteUrl(...args),
}));
vi.mock('@/lib/env', () => ({
  readEnv: (...args: unknown[]) => h.readEnv(...args),
}));

import { postConvexHttpDoor } from './convex-http-door';

class DoorUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DoorUnavailableError';
  }
}

const payloadSchema = z.strictObject({ ok: z.literal(true) });

function postSample() {
  return postConvexHttpDoor({
    path: '/sample-door',
    body: { ping: true },
    schema: payloadSchema,
    error: DoorUnavailableError,
    label: 'Sample door unavailable',
  });
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud');
  h.fetchWithTimeout.mockReset();
  h.deriveConvexSiteUrl.mockReset().mockReturnValue('https://example.convex.site');
  h.readEnv.mockReset().mockReturnValue('service-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('postConvexHttpDoor', () => {
  it('posts bearer JSON and returns the parsed contract', async () => {
    h.fetchWithTimeout.mockResolvedValueOnce(Response.json({ ok: true }));

    await expect(postSample()).resolves.toEqual({ ok: true });

    expect(h.fetchWithTimeout).toHaveBeenCalledWith(
      'https://example.convex.site/sample-door',
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer service-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ping: true }),
      }),
    );
  });

  it('fails closed when configuration, transport, status, JSON, or contract is invalid', async () => {
    h.readEnv.mockReturnValueOnce(undefined);
    await expect(postSample()).rejects.toMatchObject({
      name: 'DoorUnavailableError',
      message: 'Sample door unavailable: Convex URL or service secret is unset',
    });

    h.fetchWithTimeout.mockRejectedValueOnce(new Error('down'));
    await expect(postSample()).rejects.toBeInstanceOf(DoorUnavailableError);

    h.fetchWithTimeout.mockResolvedValueOnce(new Response('no', { status: 503 }));
    await expect(postSample()).rejects.toMatchObject({
      message: 'Sample door unavailable: /sample-door answered 503',
    });

    h.fetchWithTimeout.mockResolvedValueOnce(
      new Response('not-json', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    await expect(postSample()).rejects.toBeInstanceOf(DoorUnavailableError);

    h.fetchWithTimeout.mockResolvedValueOnce(Response.json({ ok: 'yes' }));
    await expect(postSample()).rejects.toMatchObject({
      message: 'Sample door unavailable: /sample-door returned an invalid contract',
    });
  });

  it('forwards an explicit timeout and abort signal', async () => {
    const signal = new AbortController().signal;
    h.fetchWithTimeout.mockResolvedValueOnce(Response.json({ ok: true }));

    await expect(
      postConvexHttpDoor({
        path: '/sample-door',
        body: { ping: true },
        schema: payloadSchema,
        error: DoorUnavailableError,
        label: 'Sample door unavailable',
        timeoutMs: 2_000,
        signal,
      }),
    ).resolves.toEqual({ ok: true });

    expect(h.fetchWithTimeout).toHaveBeenCalledWith(
      'https://example.convex.site/sample-door',
      expect.objectContaining({ signal }),
      2_000,
    );
  });
});
