import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { codexUploadFinalizeEndpoint } from '@/features/codex/api-contract';
import { rateLimitedFailure } from '@/lib/failure';
import { apiFetch } from '@/transport/api-client';

const PILOT = { user: { id: 'u1' }, session: {}, characterId: 9001, isAdmin: false };
const URL_U1 = 'https://store1.public.blob.vercel-storage.com/codex/local/pending/u1/0b9a3c1e-6f0d-4b55-9e0e-2f8c1d7a9b10-Ab.webp';
const ASSET = { id: 'a1', stem: 'https://store1.public.blob.vercel-storage.com/codex/local/img/ab12', width: 1920, height: 1080 };

const getSessionMock = vi.fn();
const finalizeMock = vi.fn();
const limiterMock = vi.fn();

vi.mock('@/composition/auth', () => ({ auth: { api: { getSession: () => getSessionMock() } } }));
vi.mock('@/features/codex/asset-storage', () => ({ finalizeCodexUpload: (input: unknown) => finalizeMock(input) }));
vi.mock('@/data/telemetry/queries', () => ({ logUsageEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => limiterMock() }));

async function send(url: string, origin = 'http://localhost:3000') {
  const { POST } = await import('./route');
  const response = await POST(
    new Request('http://localhost:3000/api/codex/uploads/finalize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ url }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('POST /api/codex/uploads/finalize', () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset().mockResolvedValue(PILOT);
    finalizeMock.mockReset().mockResolvedValue({ status: 'created', asset: ASSET });
    limiterMock.mockReset().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allows a minute for decoding and writing three widths', async () => {
    const { maxDuration } = await import('./route');
    expect(maxDuration).toBe(60);
  });

  it('finishes the upload under the signed-in character', async () => {
    expect(await send(URL_U1)).toEqual({ status: 200, body: { asset: ASSET } });
    expect(finalizeMock).toHaveBeenCalledWith({ url: URL_U1, userId: 'u1', characterId: 9001 });
    finalizeMock.mockResolvedValue({ status: 'reused', asset: ASSET });
    expect(await send(URL_U1)).toEqual({ status: 200, body: { asset: ASSET } });
  });

  it.each([
    ['forbidden-key', 400, 'forbidden_key'],
    ['not-image', 400, 'not_an_image'],
    ['too-large', 400, 'too_large'],
    ['too-many-pixels', 400, 'too_many_pixels'],
    ['missing', 404, 'pending_upload_missing'],
    ['quota', 429, 'upload_quota'],
    ['unconfigured', 503, 'blob_unconfigured'],
  ])('answers %s with %i %s', async (status, httpStatus, code) => {
    finalizeMock.mockResolvedValue({ status });
    expect(await send(URL_U1)).toMatchObject({ status: httpStatus, body: { code } });
  });

  it('passes a foreign address to the feature, which refuses it as forbidden', async () => {
    finalizeMock.mockResolvedValue({ status: 'forbidden-key' });
    expect(await send('https://evil.example/codex/local/pending/u1/x.webp')).toMatchObject({
      status: 400,
      body: { code: 'forbidden_key' },
    });
  });

  it('refuses a cross-origin request before touching storage', async () => {
    expect((await send(URL_U1, 'https://evil.example')).status).toBe(403);
    expect(finalizeMock).not.toHaveBeenCalled();
  });

  it('answers a throttled pilot with a retry message the client can read', async () => {
    limiterMock.mockResolvedValue({ ok: false, failure: rateLimitedFailure(30) });
    const { POST } = await import('./route');
    vi.stubGlobal('fetch', (path: string, init: RequestInit) =>
      POST(new Request(`http://localhost:3000${path}`, { ...init, headers: { ...init.headers, origin: 'http://localhost:3000' } })),
    );

    const outcome = await apiFetch(codexUploadFinalizeEndpoint, { body: { url: URL_U1 } });

    expect(outcome).toMatchObject({ ok: false, kind: 'api', status: 429, error: { code: 'rate_limited' } });
    expect(finalizeMock).not.toHaveBeenCalled();
  });
});
