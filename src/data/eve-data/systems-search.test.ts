import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { SearchContext } from '@/platform/search';
import { z } from 'zod';
import { systemSearchEntrySchema } from './api-contract';
import { formatSec, matchSystem, type SystemSearchEntry } from './systems-search';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/transport/api-client', () => ({
  apiFetch: apiFetchMock,
}));

const SYSTEMS: SystemSearchEntry[] = [

  { id: 31000001, name: 'J100001', security: -0.99 },
  { id: 30000142, name: 'Jita', security: 0.9 },
  { id: 2, name: 'Jarizza', security: -0.4 },
  { id: 3, name: 'Amarr', security: 1.0 },
  { id: 4, name: 'New Caldari', security: 0.9 },
  { id: 5, name: 'Untagged', security: null },
];

const ctx = (signal?: AbortSignal): SearchContext => ({ session: null, isAdmin: false, recents: [], signal });

async function freshModule() {
  vi.resetModules();
  return await import('./systems-search');
}

describe('system search contract', () => {
  it('pins the system search entry to SystemSearchEntry exactly (both directions)', () => {
    expectTypeOf<z.infer<typeof systemSearchEntrySchema>>().toEqualTypeOf<SystemSearchEntry>();
  });
});

describe('matchSystem', () => {
  it('prefers exact names, fuzzy-ranks prefixes, and returns null for misses', () => {
    expect(matchSystem(SYSTEMS, 'jita')?.id).toBe(30000142);
    expect(matchSystem(SYSTEMS, '  AMARR ')?.id).toBe(3);

    expect(matchSystem(SYSTEMS, 'j100001')?.id).toBe(31000001);

    expect(matchSystem(SYSTEMS, 'j')?.name).toBe('Jita');
    expect(matchSystem(SYSTEMS, 'jar')?.id).toBe(2);
    expect(matchSystem(SYSTEMS, 'j1')?.name).toBe('J100001');

    expect(matchSystem(SYSTEMS, 'zzz')).toBeNull();
    expect(matchSystem(SYSTEMS, '   ')).toBeNull();
  });
});

describe('formatSec', () => {
  it('renders one decimal with CCP rounding, with a dash for unknown security', () => {
    expect(formatSec(0.9)).toBe('0.9');
    expect(formatSec(-0.99)).toBe('-1.0');
    expect(formatSec(0.04)).toBe('0.1');
    expect(formatSec(null)).toBe('—');
  });
});

describe('systemsSource', () => {
  it('returns nothing on an empty query without fetching the index', async () => {
    const m = await freshModule();
    apiFetchMock.mockClear();
    expect(await m.systemsSource.search('', ctx())).toEqual([]);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('fuzzy-matches over the fetched index and maps rows with an inert href', async () => {
    const m = await freshModule();
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: { systems: SYSTEMS } });
    const out = await m.systemsSource.search('jita', ctx());
    expect(out[0]).toEqual({
      kind: 'system',
      id: 'system:30000142',
      label: 'Jita',
      sub: '0.9',

      href: '#',
      matchIndices: [0, 1, 2, 3],
    });
  });

  it('memoizes the index fetch across queries', async () => {
    const m = await freshModule();
    apiFetchMock.mockClear();
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: { systems: SYSTEMS } });
    await m.systemsSource.search('jita', ctx());
    await m.systemsSource.search('amarr', ctx());
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries after a failed load instead of caching the rejection, and fills the snapshot on success', async () => {
    const m = await freshModule();
    apiFetchMock.mockClear();
    apiFetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(m.loadSystems()).rejects.toThrow('network down');
    expect(m.getLoadedSystems()).toBeNull();

    apiFetchMock.mockResolvedValueOnce({ ok: true, status: 200, data: { systems: SYSTEMS } });
    await expect(m.loadSystems()).resolves.toEqual(SYSTEMS);
    expect(m.getLoadedSystems()).toEqual(SYSTEMS);
  });

  it('drops results for a query aborted mid-flight', async () => {
    const m = await freshModule();
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: { systems: SYSTEMS } });
    const ctrl = new AbortController();
    ctrl.abort();
    expect(await m.systemsSource.search('jita', ctx(ctrl.signal))).toEqual([]);
  });
});
