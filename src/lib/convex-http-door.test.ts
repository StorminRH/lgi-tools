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

import { defineConvexDoor } from './convex-door-contract';
import { ConvexDoorError, postConvexHttpDoor } from './convex-http-door';

class DoorUnavailableError extends ConvexDoorError {
  override readonly name = 'DoorUnavailableError';
}

const sampleDoor = defineConvexDoor({
  path: '/sample-door',
  request: z.strictObject({ ping: z.boolean() }),
  response: z.strictObject({ ok: z.literal(true) }),
});

function postSample() {
  return postConvexHttpDoor(sampleDoor, { ping: true }, {
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
  it('posts the door body as bearer JSON and returns the reply its response schema parsed', async () => {
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

  it.each([
    ['convex_not_configured', () => vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '')],
    ['unrecognized_convex_url', () => h.deriveConvexSiteUrl.mockReturnValueOnce(null)],
    ['service_secret_missing', () => h.readEnv.mockReturnValueOnce(undefined)],
  ] as const)('names the %s door reason without sending a request', async (reason, misconfigure) => {
    misconfigure();
    await expect(postSample()).rejects.toMatchObject({
      name: 'DoorUnavailableError',
      message: `Sample door unavailable: Convex URL or service secret is unset or unsafe (${reason})`,
    });
    expect(h.fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('fails closed when transport, status, JSON, or contract is invalid', async () => {
    const down = new Error('down');
    h.fetchWithTimeout.mockRejectedValueOnce(down);
    const failed = postSample();
    await expect(failed).rejects.toBeInstanceOf(DoorUnavailableError);
    await expect(failed).rejects.toBeInstanceOf(ConvexDoorError);
    await expect(failed).rejects.toMatchObject({
      name: 'DoorUnavailableError',
      message: 'Sample door unavailable: /sample-door request failed',
      cause: down,
    });

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

  it('throws a ConvexDoorError when the caller names no subclass', async () => {
    h.fetchWithTimeout.mockResolvedValueOnce(new Response('no', { status: 503 }));

    const failure = postConvexHttpDoor(sampleDoor, { ping: true }, { label: 'Sample door' });

    await expect(failure).rejects.toBeInstanceOf(ConvexDoorError);
    await expect(failure).rejects.toMatchObject({
      name: 'ConvexDoorError',
      message: 'Sample door: /sample-door answered 503',
    });
  });

  it('forwards an explicit timeout and abort signal', async () => {
    const signal = new AbortController().signal;
    h.fetchWithTimeout.mockResolvedValueOnce(Response.json({ ok: true }));

    await expect(
      postConvexHttpDoor(sampleDoor, { ping: true }, {
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
