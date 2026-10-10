import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settle } from '@/lib/__tests__/hook-runtime';
import type { SystemSearchEntry } from '@/data/eve-data/systems-search';

const h = vi.hoisted(() => ({
  load: vi.fn<() => Promise<unknown>>(),
  byId: null as ReadonlyMap<number, SystemSearchEntry> | null,
}));
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...rt.react,
}));
vi.mock('@/data/eve-data/systems-search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/eve-data/systems-search')>()),
  loadSystems: () => h.load(),
  getLoadedSystemsById: () => h.byId,
}));

import { useSystemName, useSystemsById } from './use-system-search';

const JITA: SystemSearchEntry = { id: 30000142, name: 'Jita', security: 0.9 };
const NIYABAINEN: SystemSearchEntry = { id: 30000143, name: 'Niyabainen', security: 0.9 };
const LOADED: ReadonlyMap<number, SystemSearchEntry> = new Map([
  [JITA.id, JITA],
  [NIYABAINEN.id, NIYABAINEN],
]);

const loads = () => {
  h.byId = LOADED;
  return Promise.resolve([JITA, NIYABAINEN]);
};

beforeEach(() => {
  h.byId = null;
  h.load.mockReset();
});

afterEach(() => {
  rt.unmount();
  vi.useRealTimers();
});

describe('useSystemsById', () => {
  it('reads an index that has already loaded without loading it again', () => {
    h.byId = LOADED;
    expect(rt.render(useSystemsById)).toBe(LOADED);
    expect(h.load).not.toHaveBeenCalled();
  });

  it('loads the index when it is wanted and holds the loaded map', async () => {
    h.load.mockImplementation(loads);
    expect(rt.render(useSystemsById)).toBeNull();
    await settle();
    expect(rt.render(useSystemsById)).toBe(LOADED);
    expect(h.load).toHaveBeenCalledOnce();
  });

  it('tries a failed load again after 15 seconds, and stops trying once unmounted', async () => {
    vi.useFakeTimers();
    h.load.mockRejectedValueOnce(new Error('network down')).mockImplementationOnce(loads);
    expect(rt.render(useSystemsById)).toBeNull();
    await vi.advanceTimersByTimeAsync(14_999);
    rt.render(useSystemsById);
    expect(h.load).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    rt.render(useSystemsById);
    expect(h.load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(rt.render(useSystemsById)).toBe(LOADED);

    rt.unmount();
    h.byId = null;
    h.load.mockRejectedValueOnce(new Error('network down'));
    rt.render(useSystemsById);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    rt.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('loads nothing while the caller does not want the index', () => {
    expect(rt.render(useSystemsById, false)).toBeNull();
    expect(h.load).not.toHaveBeenCalled();
  });
});

describe('useSystemName', () => {
  it('resolves a known id against the loaded index', () => {
    h.byId = LOADED;
    expect(rt.render(useSystemName, NIYABAINEN.id)).toBe('Niyabainen');
  });

  it('is null before the index loads, for a null id, and for an unknown id', () => {
    h.load.mockReturnValue(new Promise(() => {}));
    expect(rt.render(useSystemName, NIYABAINEN.id)).toBeNull();
    expect(h.load).toHaveBeenCalledOnce();
    rt.unmount();

    expect(rt.render(useSystemName, null)).toBeNull();
    expect(h.load).toHaveBeenCalledOnce();
    rt.unmount();

    h.byId = LOADED;
    expect(rt.render(useSystemName, 99)).toBeNull();
  });
});
