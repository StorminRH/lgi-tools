import { expect, onTestFinished, test, vi } from 'vitest';
import { settle } from '@/lib/__tests__/hook-runtime';
import type { SystemSearchEntry } from '@/data/eve-data/systems-search';

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...rt.react,
}));
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));

const JITA: SystemSearchEntry = { id: 30000142, name: 'Jita', security: 0.9 };
const NIYABAINEN: SystemSearchEntry = { id: 30000143, name: 'Niyabainen', security: 0.9 };
const indexed = { ok: true, status: 200, data: { systems: [JITA, NIYABAINEN] } };
const offline = { ok: false, kind: 'network', aborted: false, cause: new Error('offline') };

/** Fresh hooks over a fresh system index, so no test inherits another's load. */
async function freshHooks() {
  rt.unmount();
  vi.resetModules();
  h.apiFetch.mockReset();
  onTestFinished(() => {
    rt.unmount();
    vi.useRealTimers();
  });
  const hooks = await import('./use-system-search');
  const { systemsResource } = await import('@/data/eve-data/systems-search');
  return { ...hooks, systemsResource };
}

test('useSystemsById loads the index only once wanted, and a reader mounted after the load has the map on its first render', async () => {
  const { useSystemsById, systemsResource } = await freshHooks();
  h.apiFetch.mockResolvedValueOnce(indexed);

  expect(rt.render(useSystemsById, false)).toBeNull();
  expect(h.apiFetch).not.toHaveBeenCalled();
  expect(rt.render(useSystemsById)).toBeNull();
  expect(h.apiFetch).toHaveBeenCalledOnce();
  const { byId } = await systemsResource.load();
  expect(rt.render(useSystemsById)).toBe(byId);
  expect(byId.get(JITA.id)).toEqual(JITA);

  rt.unmount();
  expect(rt.render(useSystemsById)).toBe(byId);
  expect(h.apiFetch).toHaveBeenCalledOnce();
});

test('a failed index load tries again every 15 seconds while a reader wants it, and stops when the last reader leaves', async () => {
  const { useSystemsById } = await freshHooks();
  vi.useFakeTimers();
  h.apiFetch.mockResolvedValueOnce(offline).mockResolvedValueOnce(offline).mockResolvedValueOnce(indexed);

  expect(rt.render(useSystemsById)).toBeNull();
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(1);
  rt.unmount();
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(h.apiFetch).toHaveBeenCalledOnce();

  rt.render(useSystemsById);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(14_999);
  expect(rt.render(useSystemsById)).toBeNull();
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
  expect(rt.render(useSystemsById)?.get(NIYABAINEN.id)).toEqual(NIYABAINEN);
  expect(vi.getTimerCount()).toBe(0);
});

test('useSystemName loads only for an id, and resolves a known id against the loaded index', async () => {
  const { useSystemName, systemsResource } = await freshHooks();
  h.apiFetch.mockResolvedValueOnce(indexed);

  expect(rt.render(useSystemName, null)).toBeNull();
  expect(h.apiFetch).not.toHaveBeenCalled();
  expect(rt.render(useSystemName, NIYABAINEN.id)).toBeNull();
  expect(h.apiFetch).toHaveBeenCalledOnce();
  await systemsResource.load();
  expect(rt.render(useSystemName, NIYABAINEN.id)).toBe('Niyabainen');
  expect(rt.render(useSystemName, 99)).toBeNull();
});

test('the system search list fills from any caller\'s load, even after its own load failed', async () => {
  const { useSystemSearch, systemsResource } = await freshHooks();
  h.apiFetch.mockResolvedValueOnce(offline).mockResolvedValueOnce(indexed);

  const before = rt.render(useSystemSearch);
  expect(before.systems).toEqual([]);
  expect(before.parse('jita')).toEqual({ ok: false, error: { kind: 'not_found' } });
  await settle();
  // An empty list keeps one identity, so parse stays stable until the index arrives.
  expect(rt.render(useSystemSearch).systems).toBe(before.systems);

  // The search palette's own query loads the index for every reader.
  await systemsResource.load();
  const after = rt.render(useSystemSearch);
  expect(after.systems).toEqual([JITA, NIYABAINEN]);
  expect(after.parse('jita')).toEqual({ ok: true, params: { system: JITA } });
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
});
