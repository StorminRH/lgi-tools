import { beforeEach, expect, test, vi } from 'vitest';
import {
  capabilityOutcomeMock,
  recordedCapabilityOutcomes,
} from '@/lib/__tests__/capability-outcomes';
import { sessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';

const SESSION = sessionFixture();

const getSessionMock = vi.fn<() => Promise<BetterAuthSession | null>>();
const setActiveCharacterMock = vi.fn<(userId: string, characterId: number) => Promise<boolean>>();
const emitUsageEventMock = vi.fn();
const emitCostMetricMock = capabilityOutcomeMock();
const checkRateLimitMock = vi.fn();

vi.mock('@/composition/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/platform/auth/linked-characters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform/auth/linked-characters')>()),
  setActiveCharacter: (u: string, c: number) => setActiveCharacterMock(u, c),
}));

vi.mock('@/data/telemetry/usage-events', () => ({
  emitUsageEvent: (scope: string, input: unknown) => emitUsageEventMock(scope, input),
}));

vi.mock('@/data/telemetry/cost-metrics', () => ({
  emitCostMetric: (action: string, metadata: Record<string, unknown>) =>
    emitCostMetricMock(action, metadata),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
// The guard reads through getFullSession, which schedules the authorization check after the response.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
  connection: () => Promise.resolve(),
}));

import { rateLimitedFailure } from '@/lib/failure';
import { postForm } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

const ROUTE = '/api/account/active-character';

beforeEach(() => {
  getSessionMock.mockReset();
  setActiveCharacterMock.mockReset();
  emitUsageEventMock.mockReset();
  emitCostMetricMock.mockReset();
  checkRateLimitMock.mockReset().mockResolvedValue({ ok: true, remaining: 29 });
});

test('refuses anonymous, invalid, and unowned character switches', async () => {
  getSessionMock.mockResolvedValue(null);
  expect((await POST(postForm(ROUTE, { characterId: '200' }))).status).toBe(401);

  getSessionMock.mockResolvedValue(SESSION);
  expect((await POST(postForm(ROUTE, { characterId: 'not-a-number' }))).status).toBe(400);

  setActiveCharacterMock.mockResolvedValue(false);
  const unowned = await POST(postForm(ROUTE, { characterId: '999' }));
  expect(unowned.status).toBe(303);
  expect(unowned.headers.get('location')).toBe('http://localhost:3000/settings/characters?error=not_linked');
  expect(setActiveCharacterMock).toHaveBeenCalledExactlyOnceWith('eve-user-1', 999);
  expect(emitUsageEventMock).not.toHaveBeenCalled();
  expect(recordedCapabilityOutcomes(emitCostMetricMock)).toEqual([
    { outcome: 'unauthenticated', code: 'unauthenticated' },
    { outcome: 'validation', code: 'invalid_form_field' },
    { outcome: 'validation', code: 'not_linked' },
  ]);
});

test('sets the active character and redirects on a valid switch', async () => {
  getSessionMock.mockResolvedValue(SESSION);
  setActiveCharacterMock.mockResolvedValue(true);
  const res = await POST(postForm(ROUTE, { characterId: '200' }));
  expect(res.status).toBe(303);
  expect(res.headers.get('location')).toBe('http://localhost:3000/settings/characters');
  expect(setActiveCharacterMock).toHaveBeenCalledWith('eve-user-1', 200);
  expect(emitUsageEventMock).toHaveBeenCalledExactlyOnceWith('account/active-character', {
    action: 'character_switch',
    characterId: SESSION.characterId,
    metadata: { userId: 'eve-user-1', toCharacterId: 200 },
  });
});

test('throttles a switch before reading the session', async () => {
  checkRateLimitMock.mockResolvedValueOnce({ ok: false, failure: rateLimitedFailure(12) });
  const throttled = await POST(postForm(ROUTE, { characterId: '200' }));
  expect(throttled.status).toBe(429);
  expect(throttled.headers.get('Retry-After')).toBe('12');
  expect(problemBodySchema.parse(await throttled.json())).toMatchObject({
    code: 'rate_limited',
    retryAfterSeconds: 12,
  });
  expect(checkRateLimitMock).toHaveBeenCalledWith(expect.any(Request), {
    name: 'account-switch',
    perMinute: 30,
  });
  expect(getSessionMock).not.toHaveBeenCalled();
  expect(setActiveCharacterMock).not.toHaveBeenCalled();
});
