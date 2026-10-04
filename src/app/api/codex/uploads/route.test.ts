import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PILOT = { user: { id: 'u1' }, session: {}, characterId: 9001, isAdmin: false };
const NOW = new Date('2026-10-04T12:00:00Z');
const FILE = '0b9a3c1e-6f0d-4b55-9e0e-2f8c1d7a9b10';

const getSessionMock = vi.fn();
const sameOriginMock = vi.fn();
const quotaMock = vi.fn();
const handleUploadMock = vi.fn();
const tokenLimitMock = vi.fn();

vi.mock('@/composition/auth', () => ({ auth: { api: { getSession: () => getSessionMock() } } }));
vi.mock('@/platform/auth/same-origin', () => ({ requireSameOrigin: () => sameOriginMock() }));
vi.mock('@/features/codex/assets', () => ({ readUploadQuota: (userId: string) => quotaMock(userId) }));
vi.mock('@vercel/blob/client', () => ({ handleUpload: (options: unknown) => handleUploadMock(options), upload: vi.fn() }));
vi.mock('@/data/telemetry/queries', () => ({ logUsageEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ ok: true }),
  rateLimit: (identifier: string, options: unknown) => tokenLimitMock(identifier, options),
}));

const tokenRequest = (pathname: string) => ({
  type: 'blob.generate-client-token',
  payload: { pathname, clientPayload: null, multipart: false },
});

async function send(body: unknown) {
  const { POST } = await import('./route');
  const response = await POST(
    new Request('http://localhost:3000/api/codex/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('POST /api/codex/uploads', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_store1_secret');
    vi.stubEnv('VERCEL_TARGET_ENV', '');
    vi.stubEnv('VERCEL_ENV', '');
    getSessionMock.mockReset().mockResolvedValue(PILOT);
    sameOriginMock.mockReset().mockReturnValue({ ok: true });
    quotaMock.mockReset().mockResolvedValue(0);
    handleUploadMock.mockReset().mockResolvedValue({ type: 'blob.generate-client-token', clientToken: 'ct_1' });
    tokenLimitMock.mockReset().mockResolvedValue({ ok: true, remaining: 19 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('needs a signed-in pilot with a character', async () => {
    getSessionMock.mockResolvedValue(null);
    expect((await send(tokenRequest(`codex/local/pending/u1/${FILE}.webp`))).body.code).toBe('unauthenticated');
    getSessionMock.mockResolvedValue({ ...PILOT, characterId: null });
    expect(await send(tokenRequest(`codex/local/pending/u1/${FILE}.webp`))).toMatchObject({
      status: 403,
      body: { code: 'character_required' },
    });
    expect(handleUploadMock).not.toHaveBeenCalled();
  });

  it("refuses a pathname outside the caller's own pending folder", async () => {
    expect(await send(tokenRequest(`codex/local/pending/u2/${FILE}.webp`))).toMatchObject({
      status: 400,
      body: { code: 'bad_pathname' },
    });
    expect(handleUploadMock).not.toHaveBeenCalled();
  });

  it('signs a ten-minute token for an image of at most 8 MB with no completion callback', async () => {
    const response = await send(tokenRequest(`codex/local/pending/u1/${FILE}.webp`));

    expect(response).toEqual({ status: 200, body: { type: 'blob.generate-client-token', clientToken: 'ct_1' } });
    const [options] = handleUploadMock.mock.calls[0]!;
    expect(Object.keys(options).sort()).toEqual(['body', 'onBeforeGenerateToken', 'request', 'token']);
    expect(options.token).toBe('vercel_blob_rw_store1_secret');
    expect(await options.onBeforeGenerateToken(`codex/local/pending/u1/${FILE}.webp`, null, false)).toEqual({
      allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
      maximumSizeInBytes: 8_388_608,
      addRandomSuffix: true,
      validUntil: NOW.getTime() + 10 * 60 * 1000,
    });
  });

  it('refuses the twenty-first upload of the day', async () => {
    quotaMock.mockResolvedValue(20);
    expect(await send(tokenRequest(`codex/local/pending/u1/${FILE}.webp`))).toMatchObject({
      status: 429,
      body: { code: 'upload_quota' },
    });
  });

  it('refuses the twenty-first token of the day even when no upload was finalized', async () => {
    tokenLimitMock.mockResolvedValue({ ok: false, retryAfter: 3600 });
    expect(await send(tokenRequest(`codex/local/pending/u1/${FILE}.webp`))).toMatchObject({
      status: 429,
      body: { code: 'upload_quota' },
    });
    expect(tokenLimitMock).toHaveBeenCalledWith('u1', { name: 'codex-upload-tokens', perDay: 20 });
    expect(handleUploadMock).not.toHaveBeenCalled();
  });

  it('answers 503 when no Blob store is configured', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    expect(await send(tokenRequest(`codex/local/pending/u1/${FILE}.webp`))).toMatchObject({
      status: 503,
      body: { code: 'blob_unconfigured' },
    });
  });

  it('refuses a completion callback body', async () => {
    expect(await send({ type: 'blob.upload-completed', payload: {} })).toMatchObject({ status: 400 });
  });
});
