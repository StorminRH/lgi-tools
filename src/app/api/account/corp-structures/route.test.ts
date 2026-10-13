import { beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  userId: null as string | null,
  pageData: vi.fn(),
  measured: vi.fn(),
}));

vi.mock('@/composition/session', () => ({ getCurrentUserId: async () => h.userId }));
vi.mock('@/composition/sync/corp-structures-sync', () => ({
  getCorpStructuresPageData: (userId: string) => h.pageData(userId),
}));
vi.mock('@/app/api/owned-data-telemetry', () => ({
  measureOwnedDataRead: (input: { read: () => Promise<unknown> }) => {
    h.measured(input);
    return input.read();
  },
}));

import { GET } from './route';

beforeEach(() => {
  h.pageData.mockReset();
  h.measured.mockReset();
});

it('serves the signed-in account its member corps as the pages were given them, and nothing when signed out', async () => {
  h.userId = null;
  await expect((await GET()).json()).resolves.toEqual({ corporations: [], refreshing: false });
  expect(h.pageData).not.toHaveBeenCalled();

  h.userId = 'user-1';
  const corporations = [{
    corporationId: 98000001,
    corporationName: 'Corp',
    structureAccess: 'manage',
    canManageSharing: true,
    sharing: 'on',
    structures: [{ structureId: 7, typeId: 35836, systemId: 30004759, securityClass: 'null', name: null, rigTypeIds: [], taxPct: null }],
    lastRefreshedAt: null,
  }];
  h.pageData.mockResolvedValue({ corporations, refreshing: true });
  const res = await GET();
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ corporations, refreshing: true });
  expect(h.pageData).toHaveBeenCalledExactlyOnceWith('user-1');
  expect(h.measured).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ endpoint: expect.objectContaining({ path: '/api/account/corp-structures' }) }),
  );
  expect(h.measured.mock.calls[0]![0].returned({ corporations })).toBe(1);
});
