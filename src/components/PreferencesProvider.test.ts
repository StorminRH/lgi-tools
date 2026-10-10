import type { ReactElement } from 'react';
import { expect, test, vi } from 'vitest';
import { settle } from '@/lib/__tests__/hook-runtime';
import type { PreferenceDef } from '@/lib/preferences';

const h = vi.hoisted(() => ({
  identity: null as { userId: string; characterId: number } | null,
  apiFetch: vi.fn(),
  toastError: vi.fn(),
}));
// Effects re-run only when their deps change, as React does across renders.
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...rt.react,
  useContext: () => null,
}));
vi.mock('@/platform/auth/components/AuthProvider', () => ({
  useAuth: () => ({ session: null, isAdmin: false, loading: false }),
}));
vi.mock('@/platform/auth/read-identity', () => ({
  useReadIdentity: () => h.identity,
  currentReadIdentity: () => h.identity,
}));
vi.mock('@/transport/api-client', () => ({
  apiFetch: (...args: unknown[]) => h.apiFetch(...args),
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { error: (...args: unknown[]) => h.toastError(...args) },
}));

type SetPreference = <T>(def: PreferenceDef<T>, value: T) => void;

/** A fresh module graph (the store is module state) over an empty browser storage. */
async function loadPreferences(identity: typeof h.identity) {
  rt.unmount();
  vi.resetModules();
  h.identity = identity;
  h.apiFetch.mockReset();
  h.toastError.mockReset();
  const storage = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  const preferences = await import('./PreferencesProvider');
  const { sitesView } = await import('@/lib/preferences');
  const endpoints = await import('@/data/preferences/api-contract');
  const render = (): SetPreference =>
    (rt.render(preferences.PreferencesProvider, { children: null }) as ReactElement<{ value: SetPreference }>)
      .props.value;
  return { ...preferences, ...endpoints, render, sitesView, storage };
}

test('set saves locally while signed out and also to the server once ReadIdentity names a user', async () => {
  const { putPreferenceEndpoint, render, sitesView, storage, usePreference, usePreferencesReady } =
    await loadPreferences(null);
  const set = render();
  await settle();
  expect(usePreferencesReady()).toBe(true);

  set(sitesView, 'table');
  expect(usePreference(sitesView)[0]).toBe('table');
  expect(storage.get('lgi:pref:sites.view')).toBe('"table"');
  expect(h.apiFetch).not.toHaveBeenCalled();

  // AuthProvider publishes the identity; the same set reads it when called.
  h.identity = { userId: 'u1', characterId: 1 };
  h.apiFetch.mockResolvedValueOnce({ ok: false, kind: 'network', aborted: false, cause: null });
  set(sitesView, 'cards');
  expect(h.apiFetch).toHaveBeenCalledWith(putPreferenceEndpoint, {
    body: { key: 'sites.view', value: 'cards' },
  });
  expect(storage.get('lgi:pref:sites.view')).toBe('"cards"');
  await settle();
  expect(h.toastError).toHaveBeenCalledTimes(1);
  expect(usePreference(sitesView)[0]).toBe('cards');
});

test('a signed-in provider loads server preferences once per account, not per character', async () => {
  const { getPreferencesEndpoint, render, sitesView, usePreference } = await loadPreferences({
    userId: 'u1',
    characterId: 1,
  });
  h.apiFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    data: { preferences: [{ key: 'sites.view', value: 'table' }] },
  });
  render();
  await settle();
  expect(h.apiFetch).toHaveBeenCalledWith(getPreferencesEndpoint);
  expect(usePreference(sitesView)[0]).toBe('table');

  h.identity = { userId: 'u1', characterId: 2 };
  render();
  await settle();
  expect(h.apiFetch).toHaveBeenCalledTimes(1);

  h.identity = { userId: 'u2', characterId: 3 };
  h.apiFetch.mockResolvedValueOnce({ ok: true, status: 200, data: { preferences: [] } });
  render();
  await settle();
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  expect(usePreference(sitesView)[0]).toBe('cards');
});
