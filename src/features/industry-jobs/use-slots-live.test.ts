import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type * as SlotsHooks from './use-slots-live';
import type * as ReadIdentities from '@/platform/auth/read-identity';

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', () => rt.react);
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));

let hooks: typeof SlotsHooks;
let identities: typeof ReadIdentities;

const slots = () => rt.render(hooks.useSlotsLive);

beforeEach(async () => {
  rt.unmount();
  vi.resetModules();
  vi.useFakeTimers();
  h.apiFetch.mockReset();
  identities = await import('@/platform/auth/read-identity');
  identities.publishReadIdentity({ userId: 'account-a', characterId: 7 });
  hooks = await import('./use-slots-live');
});

afterEach(() => {
  rt.unmount();
  vi.useRealTimers();
});

const characters = [{ characterId: 7, synced: true, levels: { 3380: 5 } }];
const ok = { ok: true, data: { characters } };

test('a same-identity return keeps slots even when the background refresh fails', async () => {
  h.apiFetch.mockResolvedValueOnce(ok);
  expect(slots().loading).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(slots()).toEqual({ characters, loading: false });
  rt.unmount();
  h.apiFetch.mockResolvedValue({ ok: false });
  expect(slots()).toEqual({ characters, loading: false });
  await vi.advanceTimersByTimeAsync(125_000);
  expect(slots()).toEqual({ characters, loading: false });
});

test('an identity change before effect cleanup rejects the old slots response and reads the new account', async () => {
  let resolve!: (value: unknown) => void;
  h.apiFetch.mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
  slots();
  identities.publishReadIdentity({ userId: 'account-b', characterId: 7 });
  resolve(ok);
  await vi.advanceTimersByTimeAsync(0);
  h.apiFetch.mockResolvedValueOnce({ ok: true, data: { characters: [] } });
  expect(slots()).toEqual({ characters: [], loading: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(slots()).toEqual({ characters: [], loading: false });
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  identities.publishReadIdentity(null);
  expect(slots()).toEqual({ characters: [], loading: true });
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
});

test('first-read failures settle empty after the bounded retries', async () => {
  h.apiFetch.mockResolvedValue({ ok: false });
  slots();
  await vi.advanceTimersByTimeAsync(125_000);
  expect(slots()).toEqual({ characters: [], loading: false });
  expect(h.apiFetch).toHaveBeenCalledTimes(25);
});
