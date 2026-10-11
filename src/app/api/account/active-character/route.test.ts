import { beforeEach, expect, test, vi } from 'vitest';
import { sessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';

const SESSION = sessionFixture();

const getSessionMock = vi.fn<() => Promise<BetterAuthSession | null>>();
const setActiveCharacterMock = vi.fn<(userId: string, characterId: number) => Promise<boolean>>();
const logUsageEventMock = vi.fn();
const emitCostMetricMock = vi.fn<(action: string, metadata: Record<string, unknown>) => void>();

vi.mock('@/composition/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/platform/auth/linked-characters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform/auth/linked-characters')>()),
  setActiveCharacter: (u: string, c: number) => setActiveCharacterMock(u, c),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('@/data/telemetry/cost-metrics', () => ({
  emitCostMetric: (action: string, metadata: Record<string, unknown>) =>
    emitCostMetricMock(action, metadata),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { postForm } from '@/lib/__tests__/route-requests';
import { POST } from './route';

const ROUTE = '/api/account/active-character';

/** The capability outcomes the route recorded, in call order. */
function recordedOutcomes() {
  return emitCostMetricMock.mock.calls.flatMap(([action, record]) =>
    action === 'capability_outcome' ? [{ outcome: record.outcome, code: record.code }] : [],
  );
}

beforeEach(() => {
  getSessionMock.mockReset();
  setActiveCharacterMock.mockReset();
  logUsageEventMock.mockReset();
  logUsageEventMock.mockResolvedValue(undefined);
  emitCostMetricMock.mockReset();
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
  expect(logUsageEventMock).not.toHaveBeenCalled();
  expect(recordedOutcomes()).toEqual([
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
  expect(logUsageEventMock).toHaveBeenCalledTimes(1);
});
