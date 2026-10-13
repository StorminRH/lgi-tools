import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type * as Hooks from './use-corp-structures-live';
import type { CorpStructurePageView } from './types';

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', () => rt.react);
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));

let hooks: typeof Hooks;

const corp = (corporationId: number, structureIds: number[]): CorpStructurePageView => ({
  corporationId,
  corporationName: `Corp ${corporationId}`,
  structureAccess: 'use',
  canManageSharing: false,
  sharing: 'on',
  structures: structureIds.map((structureId) => ({
    structureId,
    typeId: 35832,
    systemId: 30000142,
    securityClass: 'high',
    name: null,
    rigTypeIds: [],
    taxPct: null,
  })),
  lastRefreshedAt: null,
});
const INITIAL = [corp(1, [10])];
const ok = (corporations: CorpStructurePageView[], refreshing = false) => ({ ok: true, data: { corporations, refreshing } });

beforeEach(async () => {
  rt.unmount();
  vi.resetModules();
  vi.useFakeTimers();
  h.apiFetch.mockReset();
  const identities = await import('@/platform/auth/read-identity');
  identities.publishReadIdentity({ userId: 'account-a', characterId: 7 });
  hooks = await import('./use-corp-structures-live');
});

afterEach(() => {
  rt.unmount();
  vi.useRealTimers();
});

test('draws the server render until the live read lands, then the newer rows, checking back while a refresh runs', async () => {
  h.apiFetch.mockResolvedValueOnce(ok(INITIAL, true)).mockResolvedValue(ok([corp(1, [10, 11])]));
  expect(rt.render(hooks.useCorpStructuresLive, INITIAL).corporations).toBe(INITIAL);
  expect(h.apiFetch).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/account/corp-structures' }));
  await vi.advanceTimersByTimeAsync(0);
  expect(rt.render(hooks.useCorpStructuresLive, INITIAL).corporations).toEqual(INITIAL);
  await vi.advanceTimersByTimeAsync(4_000);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  expect(rt.render(hooks.useCorpStructuresLive, INITIAL).corporations).toEqual([corp(1, [10, 11])]);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
});

test('a rig save starts the read over, and a failed read keeps what is drawn', async () => {
  h.apiFetch.mockResolvedValueOnce(ok([corp(2, [20])])).mockResolvedValue({ ok: false });
  rt.render(hooks.useCorpStructuresLive, INITIAL);
  await vi.advanceTimersByTimeAsync(0);
  hooks.refreshCorpStructures();
  const after = rt.render(hooks.useCorpStructuresLive, INITIAL);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(after.corporations).toEqual([corp(2, [20])]);
  expect(rt.render(hooks.useCorpStructuresLive, INITIAL)).toMatchObject({ corporations: [corp(2, [20])], failed: false });
});
