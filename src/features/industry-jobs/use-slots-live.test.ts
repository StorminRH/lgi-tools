import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type * as SlotsHooks from './use-slots-live';
import type * as ReadIdentities from '@/platform/auth/read-identity';

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', () => rt.react);
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));

let hooks: typeof SlotsHooks;
let identities: typeof ReadIdentities;

const slots = (eligible: number[] = [7]) => rt.render(hooks.useSlotsLive, eligible);

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

const capacity = { manufacturing: 1, science: 1, reactions: 1 };
const synced = { characterId: 7, slots: capacity, synced: true, levels: { 3380: 5 } };
const unsynced = (characterId: number) => ({ characterId, slots: capacity, synced: false, levels: null });
const answer = (characters: unknown[], refreshing = false) => ({ ok: true, data: { characters, refreshing } });
const offline = { ok: false, kind: 'network', aborted: false, cause: new Error('offline') };

test('draws the slots at once, keeps them through a failed re-read, and reads through the shared loop', async () => {
  h.apiFetch.mockResolvedValueOnce(answer([synced]));
  expect(slots()).toMatchObject({ characters: [], loading: true, failed: false });
  await vi.advanceTimersByTimeAsync(0);
  expect(slots()).toMatchObject({ characters: [synced], loading: false, failed: false });
  expect(h.apiFetch).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/account/industry-slots' }));
  rt.unmount();
  h.apiFetch.mockResolvedValue(offline);
  expect(slots()).toMatchObject({ characters: [synced], loading: false });
  await vi.advanceTimersByTimeAsync(125_000);
  expect(slots()).toMatchObject({ characters: [synced], loading: false, failed: false });
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
});

test('checks back while an eligible pilot is unsynced or a refresh is under way, then stops', async () => {
  const caughtUp = { ...unsynced(8), synced: true, levels: {} };
  h.apiFetch
    .mockResolvedValueOnce(answer([synced, unsynced(8)]))
    .mockResolvedValueOnce(answer([synced, caughtUp], true))
    .mockResolvedValue(answer([synced, caughtUp]));
  slots([7, 8]);
  await vi.advanceTimersByTimeAsync(0);
  expect(h.apiFetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(4_000);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(8_000);
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
  expect(slots([7, 8]).characters).toHaveLength(2);
});

test('an identity change before effect cleanup rejects the old slots response and reads the new account', async () => {
  let resolve!: (value: unknown) => void;
  h.apiFetch.mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
  slots();
  identities.publishReadIdentity({ userId: 'account-b', characterId: 7 });
  resolve(answer([synced]));
  await vi.advanceTimersByTimeAsync(0);
  h.apiFetch.mockResolvedValueOnce(answer([]));
  expect(slots()).toMatchObject({ characters: [], loading: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(slots()).toMatchObject({ characters: [], loading: false });
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  identities.publishReadIdentity(null);
  expect(slots()).toMatchObject({ characters: [], loading: true, failed: false });
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
});

test('a first read that fails is retried once, then reports failed until a retry reads again', async () => {
  h.apiFetch.mockResolvedValue(offline);
  slots();
  await vi.advanceTimersByTimeAsync(3_999);
  expect(h.apiFetch).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  const failed = slots();
  expect(failed).toMatchObject({ characters: [], loading: false, failed: true });
  // The empty list keeps its identity, so a memo over it holds.
  expect(slots().characters).toBe(failed.characters);
  await vi.advanceTimersByTimeAsync(125_000);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);

  h.apiFetch.mockResolvedValueOnce(answer([synced]));
  failed.retry();
  expect(slots()).toMatchObject({ characters: [], loading: true, failed: false });
  await vi.advanceTimersByTimeAsync(0);
  expect(slots()).toMatchObject({ characters: [synced], loading: false, failed: false });
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
});

test('a pilot whose skills cannot sync is never waited on', async () => {
  h.apiFetch.mockResolvedValue(answer([synced, unsynced(8)]));
  slots([7]);
  await vi.advanceTimersByTimeAsync(600_000);
  expect(h.apiFetch).toHaveBeenCalledOnce();
  expect(slots([7]).characters).toEqual([synced, unsynced(8)]);
});

test('a skill-eligible pilot still syncing is reconciled on a backoff, then given up on', async () => {
  h.apiFetch.mockResolvedValue(answer([synced, unsynced(8)]));
  slots([7, 8]);
  await vi.advanceTimersByTimeAsync(0);
  const counts: number[] = [];
  for (const wait of [4_000, 8_000, 15_000, 30_000, 60_000]) {
    await vi.advanceTimersByTimeAsync(wait - 1);
    counts.push(h.apiFetch.mock.calls.length);
    await vi.advanceTimersByTimeAsync(1);
    counts.push(h.apiFetch.mock.calls.length);
  }
  expect(counts).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
  await vi.advanceTimersByTimeAsync(600_000);
  expect(h.apiFetch).toHaveBeenCalledTimes(6);
});
