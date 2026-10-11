import { expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  userId: null as string | null,
  read: vi.fn(),
  logUsageEvent: vi.fn(async (_event: unknown) => {}),
}));

vi.mock('@/composition/session', () => ({ getCurrentUserId: async () => h.userId }));
vi.mock('@/composition/sync/corp-structures-sync', () => ({
  getCorpStructuresForUserOnView: (userId: string) => h.read(userId),
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (work: () => unknown) => work(),
}));
vi.mock('@/data/telemetry/log', () => ({ logUsageEvent: h.logUsageEvent }));

import { GET } from './route';

it('records one owned-data read for a signed-in viewer, and reads nothing when signed out', async () => {
  h.userId = null;
  const anonymous = await GET();
  expect(anonymous.status).toBe(200);
  await expect(anonymous.json()).resolves.toEqual({ corporations: [] });
  expect(h.read).not.toHaveBeenCalled();
  expect(h.logUsageEvent).not.toHaveBeenCalled();

  h.userId = 'user-1';
  const corporations = [
    {
      corporationId: 98000001,
      structures: [
        {
          structureId: 1035466617946,
          typeId: 35827,
          systemId: 30000142,
          securityClass: 'high',
          name: 'Jita - Sotiyo',
        },
      ],
      lastRefreshedAt: 1_760_000_000_000,
    },
    { corporationId: 98000002, structures: [], lastRefreshedAt: null },
  ];
  h.read.mockResolvedValue({ corporations });
  const signedIn = await GET();
  expect(signedIn.status).toBe(200);
  await expect(signedIn.json()).resolves.toEqual({ corporations });
  expect(h.read).toHaveBeenCalledWith('user-1');
  expect(h.logUsageEvent).toHaveBeenCalledTimes(1);
  expect(h.logUsageEvent).toHaveBeenCalledWith({
    action: 'owned_data_read',
    metadata: {
      endpoint: '/api/account/corp-structures',
      returned: 2,
      outcome: 'succeeded',
      durationMs: expect.any(Number),
    },
  });
});
