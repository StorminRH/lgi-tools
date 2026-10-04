import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type * as SlotsHooks from './use-slots-live';
import type * as ReadIdentities from '@/platform/auth/read-identity';

const h = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  cleanup: undefined as (() => void) | undefined,
  deps: undefined as readonly unknown[] | undefined,
}));

vi.mock('react', () => ({
  useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
  useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
    if (h.deps && deps.every((dep, i) => Object.is(dep, h.deps![i]))) return;
    h.cleanup?.();
    h.deps = deps;
    h.cleanup = effect() || undefined;
  },
}));
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));

let hooks: typeof SlotsHooks;
let identities: typeof ReadIdentities;

function remount() {
  h.cleanup?.();
  h.cleanup = undefined;
  h.deps = undefined;
}

beforeEach(async () => {
  remount();
  vi.resetModules();
  vi.useFakeTimers();
  h.apiFetch.mockReset();
  identities = await import('@/platform/auth/read-identity');
  identities.publishReadIdentity({ userId: 'account-a', characterId: 7 });
  hooks = await import('./use-slots-live');
});

afterEach(() => {
  remount();
  vi.useRealTimers();
});

const characters = [{ characterId: 7, synced: true, levels: { 3380: 5 } }];
const ok = { ok: true, data: { characters } };

test('a same-identity return keeps slots even when the background refresh fails', async () => {
  h.apiFetch.mockResolvedValueOnce(ok);
  expect(hooks.useSlotsLive().loading).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(hooks.useSlotsLive()).toEqual({ characters, loading: false });
  remount();
  h.apiFetch.mockResolvedValue({ ok: false });
  expect(hooks.useSlotsLive()).toEqual({ characters, loading: false });
  await vi.advanceTimersByTimeAsync(125_000);
  expect(hooks.useSlotsLive()).toEqual({ characters, loading: false });
});

test('an identity change before effect cleanup rejects the old slots response and reads the new account', async () => {
  let resolve!: (value: unknown) => void;
  h.apiFetch.mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
  hooks.useSlotsLive();
  identities.publishReadIdentity({ userId: 'account-b', characterId: 7 });
  resolve(ok);
  await vi.advanceTimersByTimeAsync(0);
  h.apiFetch.mockResolvedValueOnce({ ok: true, data: { characters: [] } });
  expect(hooks.useSlotsLive()).toEqual({ characters: [], loading: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(hooks.useSlotsLive()).toEqual({ characters: [], loading: false });
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  identities.publishReadIdentity(null);
  expect(hooks.useSlotsLive()).toEqual({ characters: [], loading: true });
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
});

test('first-read failures settle empty after the bounded retries', async () => {
  h.apiFetch.mockResolvedValue({ ok: false });
  hooks.useSlotsLive();
  await vi.advanceTimersByTimeAsync(125_000);
  expect(hooks.useSlotsLive()).toEqual({ characters: [], loading: false });
  expect(h.apiFetch).toHaveBeenCalledTimes(25);
});
