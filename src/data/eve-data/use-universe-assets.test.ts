import { expect, onTestFinished, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', () => rt.react);
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));

const manifest = { ok: true, status: 200, data: { version: 'v1' } };
const offline = { ok: false, kind: 'network', aborted: false, cause: new Error('offline') };
const codex = {
  ok: true,
  status: 200,
  data: { version: 'v1', types: [{ code: 'K162', typeId: 30831, farSide: true }], effects: [] },
};

function universe(endpoint: { path: string }) {
  if (endpoint.path === '/api/universe/assets') return Promise.resolve(manifest);
  if (endpoint.path.endsWith('/systems')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      data: { version: 'v1', systems: [{ id: 30000142, name: 'Jita', regionName: 'The Forge', whClassId: 7, security: 0.9 }] },
    });
  }
  return Promise.resolve({ ok: true, status: 200, data: { version: 'v1', adjacency: [[30000142, [30000144]]] } });
}

/** Fresh hooks over fresh asset singletons, so no test inherits another's load. */
async function freshHooks() {
  rt.unmount();
  vi.resetModules();
  h.apiFetch.mockReset();
  onTestFinished(() => {
    rt.unmount();
    vi.useRealTimers();
  });
  return { ...(await import('./use-universe-assets')), ...(await import('./universe-assets-client')) };
}

test('a k-space caption mounted after the universe assets load renders them on its first client render', async () => {
  const { useUniverseAssets, loadUniverseAssets } = await freshHooks();
  h.apiFetch.mockImplementation(universe);

  // The first caption on screen starts the one load every caption shares.
  expect(rt.render(useUniverseAssets)).toBeNull();
  expect(h.apiFetch).toHaveBeenCalled();
  const assets = await loadUniverseAssets();
  expect(rt.render(useUniverseAssets)).toBe(assets);

  // Panned out of view and back in, a node mounts fresh and paints its caption at once.
  rt.unmount();
  expect(rt.render(useUniverseAssets)?.systemInfo(30000142)?.name).toBe('Jita');
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
});

test('the codex reports a failure from the first failed load until a retry succeeds, without flickering back to loading', async () => {
  const { useWormholeCodexStatus, useWormholeCodex } = await freshHooks();
  vi.useFakeTimers();
  let deliver!: (outcome: unknown) => void;
  h.apiFetch
    .mockResolvedValueOnce(offline)
    .mockReturnValueOnce(new Promise((resolve) => {
      deliver = resolve;
    }))
    .mockResolvedValueOnce(codex);

  expect(rt.render(useWormholeCodexStatus)).toEqual({ codex: null, failed: false });
  await vi.advanceTimersByTimeAsync(0);
  expect(rt.render(useWormholeCodexStatus)).toEqual({ codex: null, failed: true });

  await vi.advanceTimersByTimeAsync(15_000);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  expect(rt.render(useWormholeCodexStatus)).toEqual({ codex: null, failed: true });

  deliver(manifest);
  await vi.advanceTimersByTimeAsync(0);
  const loaded = rt.render(useWormholeCodexStatus);
  expect(loaded.failed).toBe(false);
  expect(loaded.codex?.byCode('K162')).toEqual({ code: 'K162', typeId: 30831, farSide: true });
  rt.unmount();
  expect(rt.render(useWormholeCodex)).toBe(loaded.codex);
});
