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

const synced = { characterId: 7, synced: true, levels: { 3380: 5 } };
const unsynced = { characterId: 8, synced: false, levels: null };
const ok = (characters: unknown[], refreshing = false) => ({ ok: true, data: { characters, refreshing } });

test('draws the slots at once, keeps them through a failed re-read, and reads through the shared loop', async () => {
  h.apiFetch.mockResolvedValueOnce(ok([synced]));
  expect(slots()).toMatchObject({ characters: [], loading: true, failed: false });
  await vi.advanceTimersByTimeAsync(0);
  expect(slots()).toMatchObject({ characters: [synced], loading: false });
  expect(h.apiFetch).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/account/industry-slots' }));
  rt.unmount();
  h.apiFetch.mockResolvedValue({ ok: false });
  expect(slots()).toMatchObject({ characters: [synced], loading: false, failed: false });
  await vi.advanceTimersByTimeAsync(125_000);
  expect(slots()).toMatchObject({ characters: [synced], loading: false, failed: false });
});

test('checks back while a character is unsynced or a refresh is under way, then stops', async () => {
  h.apiFetch
    .mockResolvedValueOnce(ok([synced, unsynced]))
    .mockResolvedValueOnce(ok([synced, { ...unsynced, synced: true, levels: {} }], true))
    .mockResolvedValue(ok([synced, { ...unsynced, synced: true, levels: {} }]));
  slots();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.apiFetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(4_000);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(8_000);
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
  expect(slots().characters).toHaveLength(2);
});

test('an identity change before effect cleanup rejects the old slots response and reads the new account', async () => {
  let resolve!: (value: unknown) => void;
  h.apiFetch.mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
  slots();
  identities.publishReadIdentity({ userId: 'account-b', characterId: 7 });
  resolve(ok([synced]));
  await vi.advanceTimersByTimeAsync(0);
  h.apiFetch.mockResolvedValueOnce(ok([]));
  expect(slots()).toMatchObject({ characters: [], loading: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(slots()).toMatchObject({ characters: [], loading: false });
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  identities.publishReadIdentity(null);
  expect(slots()).toMatchObject({ characters: [], loading: true });
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
});

test('first-read failures settle as failed after one retry, with a retry handle', async () => {
  h.apiFetch.mockResolvedValue({ ok: false });
  slots();
  await vi.advanceTimersByTimeAsync(125_000);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  const settled = slots();
  expect(settled).toMatchObject({ characters: [], loading: false, failed: true });
  expect(typeof settled.retry).toBe('function');
});
