import { beforeEach, expect, test, vi } from 'vitest';
import type { BuildCharacter } from './run-as-state';

const h = vi.hoisted(() => ({
  auth: { session: { characterId: 7 } as { characterId: number } | null, loading: false },
  apiFetch: vi.fn(),
  cleanup: undefined as (() => void) | undefined,
  deps: undefined as unknown[] | undefined,
}));

vi.mock('react', () => ({
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    if (h.deps && deps.every((value, i) => Object.is(value, h.deps![i]))) return;
    h.cleanup?.();
    h.deps = deps;
    h.cleanup = effect() || undefined;
  },
}));
vi.mock('@/platform/auth/components/AuthProvider', () => ({ useAuth: () => h.auth }));
vi.mock('@/transport/api-client', () => ({ apiFetch: (...args: unknown[]) => h.apiFetch(...args) }));

let hooks: typeof import('./use-account-characters');
let identities: typeof import('@/platform/auth/read-identity');
const roster: BuildCharacter[] = [{
  characterId: 7, name: 'Pilot Seven', portraitUrl: '/seven.png',
  needsReconnect: false, needsLocationReconnect: false,
}];
const failed = { ok: false, kind: 'protocol', status: 500, detail: 'Endpoint returned an undeclared status' };
const offline = { ok: false, kind: 'network', aborted: false, cause: new Error('offline') };

function remount() {
  h.cleanup?.();
  h.cleanup = undefined;
  h.deps = undefined;
}

beforeEach(async () => {
  remount();
  vi.resetModules();
  h.auth = { session: { characterId: 7 }, loading: false };
  h.apiFetch.mockReset();
  identities = await import('@/platform/auth/read-identity');
  identities.publishReadIdentity({ userId: 'account-a', characterId: 7 });
  hooks = await import('./use-account-characters');
});

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('a return draws the remembered roster while refreshing and retains it on a refused refresh', async () => {
  h.apiFetch.mockResolvedValueOnce({ ok: true, data: { characters: roster } });
  expect(hooks.useAccountCharacters()).toBeNull();
  await settle();
  expect(hooks.useAccountCharacters()).toEqual(roster);

  remount();
  h.apiFetch.mockResolvedValueOnce(failed);
  expect(hooks.useAccountCharacters()).toEqual(roster);
  await settle();
  expect(hooks.useAccountCharacters()).toEqual(roster);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
});

test('a first failed read settles empty, and a later successful refresh replaces it', async () => {
  h.apiFetch.mockResolvedValueOnce(failed);
  expect(hooks.useAccountCharacters()).toBeNull();
  await settle();
  expect(hooks.useAccountCharacters()).toEqual([]);

  remount();
  h.apiFetch.mockResolvedValueOnce({ ok: true, data: { characters: roster } });
  hooks.useAccountCharacters();
  await settle();
  expect(hooks.useAccountCharacters()).toEqual(roster);
});

test('an unreachable refresh keeps the remembered pilots, but a different pilot never receives that roster', async () => {
  h.apiFetch.mockResolvedValueOnce({ ok: true, data: { characters: roster } });
  hooks.useAccountCharacters();
  await settle();
  remount();
  h.apiFetch.mockResolvedValueOnce(offline);
  hooks.useAccountCharacters();
  await settle();
  expect(hooks.useAccountCharacters()).toEqual(roster);

  h.auth.session = { characterId: 8 };
  identities.publishReadIdentity({ userId: 'account-a', characterId: 8 });
  h.apiFetch.mockResolvedValueOnce(offline);
  expect(hooks.useAccountCharacters()).toBeNull();
  await settle();
  expect(hooks.useAccountCharacters()).toEqual([]);

  h.auth.session = null;
  identities.publishReadIdentity(null);
  expect(hooks.useAccountCharacters()).toEqual([]);
  expect(hooks.useActiveCharacterId()).toBeNull();
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
});

test.each(['success', 'abort'] as const)('unmount aborts the request and ignores a late %s', async (completion) => {
  let resolve!: (value: unknown) => void;
  h.apiFetch.mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
  hooks.useAccountCharacters();
  const signal = h.apiFetch.mock.calls[0]![1].signal as AbortSignal;
  remount();
  expect(signal.aborted).toBe(true);
  if (completion === 'success') resolve({ ok: true, data: { characters: roster } });
  else resolve({ ok: false, kind: 'network', aborted: true, cause: new DOMException('aborted', 'AbortError') });
  await settle();
  h.apiFetch.mockReturnValueOnce(new Promise(() => {}));
  expect(hooks.useAccountCharacters()).toBeNull();
});

test('authentication loading hides the roster and reports no active character', () => {
  h.auth = { session: null, loading: true };
  identities.publishReadIdentity(null);
  expect(hooks.useAccountCharacters()).toBeNull();
  expect(hooks.useActiveCharacterId()).toBeNull();
  expect(h.apiFetch).not.toHaveBeenCalled();
  h.auth = { session: { characterId: 7 }, loading: false };
  identities.publishReadIdentity({ userId: 'account-a', characterId: 7 });
  expect(hooks.useActiveCharacterId()).toBe(7);
});

test('a different account with the same active character never receives the earlier roster', async () => {
  h.apiFetch.mockResolvedValueOnce({ ok: true, data: { characters: roster } });
  hooks.useAccountCharacters();
  await settle();
  expect(hooks.useAccountCharacters()).toEqual(roster);
  identities.publishReadIdentity({ userId: 'account-b', characterId: 7 });
  h.apiFetch.mockReturnValueOnce(new Promise(() => {}));
  expect(hooks.useAccountCharacters()).toBeNull();
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
});
