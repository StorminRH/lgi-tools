import { expect, test, vi } from 'vitest';
import { postJson } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';

const CHARACTER_ID = 1000000000;

const getSessionCharacterIdMock = vi.fn();
const logUsageEventMock = vi.fn();
const afterMock = vi.fn();
const checkRateLimitMock = vi.fn();

vi.mock('@/composition/session', () => ({
  getSessionCharacterId: () => getSessionCharacterIdMock(),
}));

vi.mock('@/data/telemetry/log', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => unknown) => afterMock(task),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));

import { POST } from './route';

const ROUTE = '/api/telemetry';

function resetMocks() {
  getSessionCharacterIdMock.mockReset().mockResolvedValue(null);
  logUsageEventMock.mockReset().mockResolvedValue(undefined);
  afterMock.mockReset();
  checkRateLimitMock.mockReset().mockResolvedValue({ ok: true });
}

test('POST /api/telemetry answers 204 first, then reads the session and records the event, signed in or anonymous', async () => {
  // Signed in: nothing is read or written before the response.
  resetMocks();
  getSessionCharacterIdMock.mockResolvedValue(CHARACTER_ID);
  const signedIn = await POST(postJson(ROUTE, { action: 'page_view', metadata: { path: '/sites' } }));
  expect(signedIn.status).toBe(204);
  expect(afterMock).toHaveBeenCalledOnce();
  expect(getSessionCharacterIdMock).not.toHaveBeenCalled();
  expect(logUsageEventMock).not.toHaveBeenCalled();

  await afterMock.mock.calls[0]![0]();

  expect(logUsageEventMock).toHaveBeenCalledExactlyOnceWith({
    action: 'page_view',
    characterId: CHARACTER_ID,
    metadata: { path: '/sites' },
  });

  // Anonymous: the event is recorded with a null characterId.
  resetMocks();
  const anonymous = await POST(postJson(ROUTE, { action: 'page_view', metadata: { path: '/' } }));
  expect(anonymous.status).toBe(204);

  await afterMock.mock.calls[0]![0]();

  expect(logUsageEventMock).toHaveBeenCalledExactlyOnceWith({
    action: 'page_view',
    characterId: null,
    metadata: { path: '/' },
  });
});

test('POST /api/telemetry refuses forged, malformed and oversized bodies with 400 and a flooding caller with 429, recording nothing', async () => {
  resetMocks();
  for (const body of [
    { action: 'malicious_action' },
    // A server-only action a client must not forge.
    { action: 'cron_prices' },
    { action: 'page_view', metadata: 'not-an-object' },
  ]) {
    expect((await POST(postJson(ROUTE, body))).status, JSON.stringify(body)).toBe(400);
  }

  const oversized = await POST(postJson(ROUTE, { action: 'page_view', metadata: { blob: 'x'.repeat(3000) } }));
  expect(oversized.status).toBe(400);
  expect(problemBodySchema.parse(await oversized.json())).toMatchObject({ code: 'metadata_too_large' });

  const malformed = await POST(postJson(ROUTE, 'not json'));
  expect(malformed.status).toBe(400);
  expect(problemBodySchema.parse(await malformed.json())).toMatchObject({ code: 'invalid_json' });
  expect(afterMock).not.toHaveBeenCalled();

  checkRateLimitMock.mockResolvedValueOnce({
    ok: false,
    failure: {
      category: 'rate_limited',
      code: 'rate_limited',
      retryAfterSeconds: 42,
    },
  });
  const limited = await POST(postJson(ROUTE, { action: 'page_view', metadata: { path: '/' } }));
  expect(limited.status).toBe(429);
  expect(limited.headers.get('Retry-After')).toBe('42');
  expect(problemBodySchema.parse(await limited.json())).toMatchObject({
    code: 'rate_limited',
    retryAfterSeconds: 42,
  });
  expect(getSessionCharacterIdMock).not.toHaveBeenCalled();
  expect(afterMock).not.toHaveBeenCalled();
});
