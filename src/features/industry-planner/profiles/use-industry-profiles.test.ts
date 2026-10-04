import { beforeEach, expect, test, vi } from 'vitest';
import { currentReadIdentity, publishReadIdentity } from '@/platform/auth/read-identity';
import { deleteIndustryProfileEndpoint, industryProfilesEndpoint, type IndustryProfileRow } from './api-contract';
import { emptyProfileDocument } from './profile-document';

const h = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  notify: vi.fn(),
  states: [] as unknown[],
  stateIndex: 0,
  memos: [] as { deps: readonly unknown[]; value: unknown }[],
  memoIndex: 0,
  effectDeps: undefined as readonly unknown[] | undefined,
}));

vi.mock('react', () => ({
  useCallback: <T>(callback: T) => callback,
  useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
  useState: <T>(initial: T) => {
    const index = h.stateIndex++;
    if (!(index in h.states)) h.states[index] = initial;
    return [h.states[index], (next: T) => { h.states[index] = next; }];
  },
  useMemo: <T>(make: () => T, deps: readonly unknown[]) => {
    const index = h.memoIndex++;
    const held = h.memos[index];
    if (!held || deps.some((dep, i) => !Object.is(dep, held.deps[i]))) h.memos[index] = { deps, value: make() };
    return h.memos[index]!.value;
  },
  useEffect: (effect: () => void, deps: readonly unknown[]) => {
    if (!h.effectDeps || deps.some((dep, i) => !Object.is(dep, h.effectDeps![i]))) {
      h.effectDeps = deps;
      effect();
    }
  },
}));
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));
vi.mock('@/components/ui/toast', () => ({ toast: { error: h.notify } }));
vi.mock('../read-with-retries', () => ({ readWithRetries: (read: () => Promise<unknown>) => read().catch(() => null) }));

import { useIndustryProfiles } from './use-industry-profiles';

const profile: IndustryProfileRow = {
  id: 'a-profile', name: 'Private production line', revision: 1,
  document: emptyProfileDocument(), updatedAt: '2026-10-03T00:00:00Z',
};
const ok = (profiles: IndustryProfileRow[]) => ({ ok: true, data: { profiles } });

function ProfilesHarness() {
  return useIndustryProfiles(currentReadIdentity() !== null);
}

function render() {
  h.stateIndex = 0;
  h.memoIndex = 0;
  return ProfilesHarness();
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  publishReadIdentity(null);
  publishReadIdentity({ userId: 'account-a', characterId: 7 });
  h.states.length = 0;
  h.memos.length = 0;
  h.effectDeps = undefined;
  h.apiFetch.mockReset();
  h.notify.mockReset();
});

test('same-identity remounts keep their profiles while a background refresh fails', async () => {
  h.apiFetch.mockResolvedValueOnce(ok([profile]));
  expect(render().profiles).toBeNull();
  await settle();
  expect(render().profiles).toEqual([profile]);
  h.states.length = 0;
  h.memos.length = 0;
  h.effectDeps = undefined;
  h.apiFetch.mockResolvedValueOnce({ ok: false });
  expect(render().profiles).toEqual([profile]);
  await settle();
  expect(render().profiles).toEqual([profile]);
});

test('an account change masks local profiles and failure state before its next read settles', async () => {
  h.apiFetch.mockResolvedValueOnce(ok([profile]));
  render();
  await settle();
  expect(render().profiles).toEqual([profile]);
  publishReadIdentity({ userId: 'account-b', characterId: 7 });
  h.apiFetch.mockResolvedValueOnce({ ok: false });
  expect(render()).toMatchObject({ profiles: null, listFailed: false, busy: false });
  await settle();
  expect(render()).toMatchObject({ profiles: null, listFailed: true });
  publishReadIdentity(null);
  expect(render()).toMatchObject({ profiles: null, listFailed: false, busy: false });
});

test('a late create cannot publish old profiles, return its id, or clear a new identity busy state', async () => {
  h.apiFetch.mockResolvedValueOnce(ok([profile]));
  render();
  await settle();
  let resolve!: (value: unknown) => void;
  h.apiFetch.mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
  const created = render().create('A new line', emptyProfileDocument());
  await settle();
  expect(render().busy).toBe(true);
  publishReadIdentity({ userId: 'account-b', characterId: 8 });
  h.apiFetch.mockReturnValueOnce(new Promise(() => {}));
  expect(render()).toMatchObject({ profiles: null, busy: false });
  resolve({ ok: true, data: { profiles: [profile], id: 'a-new-profile' } });
  expect(await created).toBeNull();
  expect(render()).toMatchObject({ profiles: null, busy: false });
  expect(h.notify).not.toHaveBeenCalled();
});

test('deleting a profile publishes the returned list and remembers it across a same-account remount', async () => {
  h.apiFetch.mockResolvedValueOnce(ok([profile]));
  render();
  await settle();
  let resolve!: (value: unknown) => void;
  h.apiFetch.mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
  const deleted = render().remove(profile.id);
  await settle();
  expect(render().busy).toBe(true);
  expect(h.apiFetch).toHaveBeenLastCalledWith(deleteIndustryProfileEndpoint, { body: { id: profile.id } });
  resolve(ok([]));
  expect(await deleted).toBe(true);
  expect(render()).toMatchObject({ profiles: [], busy: false });
  h.states.length = 0;
  h.memos.length = 0;
  h.effectDeps = undefined;
  h.apiFetch.mockReturnValueOnce(new Promise(() => {}));
  expect(render()).toMatchObject({ profiles: [], busy: false });
  expect(h.notify).not.toHaveBeenCalled();
});

test.each(['refused', 'rejected'] as const)('a %s delete preserves profiles, clears busy and reports the failure', async (failure) => {
  h.apiFetch.mockResolvedValueOnce(ok([profile]));
  render();
  await settle();
  if (failure === 'refused') h.apiFetch.mockResolvedValueOnce({ ok: false, error: { code: 'profile_missing' } });
  else h.apiFetch.mockRejectedValueOnce(new Error('offline'));
  expect(await render().remove(profile.id)).toBe(false);
  expect(render()).toMatchObject({ profiles: [profile], busy: false });
  expect(h.notify).toHaveBeenCalledExactlyOnceWith("Couldn't delete the profile.");
});

test.each([
  { userId: 'account-b', characterId: 7 },
  { userId: 'account-a', characterId: 8 },
  null,
])('a stale remove callback after changing identity to %j dispatches nothing', async (next) => {
  h.apiFetch.mockResolvedValueOnce(ok([profile]));
  render();
  await settle();
  const oldRemove = render().remove;
  publishReadIdentity(next);
  expect(await oldRemove(profile.id)).toBe(false);
  expect(h.apiFetch).toHaveBeenCalledOnce();
  expect(h.notify).not.toHaveBeenCalled();
});

test('a signed-out reader cannot dispatch a delete', async () => {
  publishReadIdentity(null);
  expect(await render().remove(profile.id)).toBe(false);
  expect(h.apiFetch).not.toHaveBeenCalled();
  expect(render().busy).toBe(false);
});

test('changing identity cancels a delete queued behind an old account read', async () => {
  let resolve!: (value: unknown) => void;
  h.apiFetch.mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
  const deleted = render().remove(profile.id);
  await settle();
  expect(h.apiFetch).toHaveBeenCalledExactlyOnceWith(industryProfilesEndpoint, { cache: 'no-store' });
  publishReadIdentity({ userId: 'account-b', characterId: 8 });
  h.apiFetch.mockReturnValueOnce(new Promise(() => {}));
  expect(render()).toMatchObject({ profiles: null, busy: false });
  resolve(ok([profile]));
  expect(await deleted).toBe(false);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  expect(h.apiFetch.mock.calls.every(([endpoint]) => endpoint === industryProfilesEndpoint)).toBe(true);
  expect(render()).toMatchObject({ profiles: null, busy: false });
  expect(h.notify).not.toHaveBeenCalled();
});

test('a late old-account delete cannot replace new profiles or clear the new account delete in progress', async () => {
  h.apiFetch.mockResolvedValueOnce(ok([profile]));
  render();
  await settle();
  let resolveOld!: (value: unknown) => void;
  h.apiFetch.mockReturnValueOnce(new Promise((yes) => { resolveOld = yes; }));
  const oldDeleted = render().remove(profile.id);
  await settle();
  const nextProfile = { ...profile, id: 'b-profile', name: 'Another account line' };
  publishReadIdentity({ userId: 'account-b', characterId: 8 });
  h.apiFetch.mockResolvedValueOnce(ok([nextProfile]));
  expect(render()).toMatchObject({ profiles: null, busy: false });
  await settle();
  expect(render().profiles).toEqual([nextProfile]);
  let resolveNew!: (value: unknown) => void;
  h.apiFetch.mockReturnValueOnce(new Promise((yes) => { resolveNew = yes; }));
  const newDeleted = render().remove(nextProfile.id);
  await settle();
  expect(render().busy).toBe(true);
  resolveOld(ok([]));
  expect(await oldDeleted).toBe(false);
  expect(render()).toMatchObject({ profiles: [nextProfile], busy: true });
  resolveNew(ok([]));
  expect(await newDeleted).toBe(true);
  expect(render()).toMatchObject({ profiles: [], busy: false });
  expect(h.notify).not.toHaveBeenCalled();
});
