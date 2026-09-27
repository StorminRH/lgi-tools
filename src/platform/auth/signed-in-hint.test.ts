import { afterEach, expect, test, vi } from 'vitest';
import { reloadDocumentHome } from './reload-document-home';
import { SIGNED_IN_HINT_KEY, writeSignedInHint } from './signed-in-hint';

function stubWindow() {
  const store = new Map<string, string>();
  const window = {
    location: { href: '/sites' },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  };
  vi.stubGlobal('window', window);
  return { store, window };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('writes and clears the signed-in hint', () => {
  const { store } = stubWindow();
  writeSignedInHint(true);
  expect(store.get(SIGNED_IN_HINT_KEY)).toBe('1');
  writeSignedInHint(false);
  expect(store.has(SIGNED_IN_HINT_KEY)).toBe(false);
});

test('ignores storage that throws', () => {
  vi.stubGlobal('window', {
    localStorage: {
      setItem: () => {
        throw new Error('blocked');
      },
    },
  });
  expect(() => writeSignedInHint(true)).not.toThrow();
});

test('the post sign-out reload clears the hint before navigating home', () => {
  const { store, window } = stubWindow();
  store.set(SIGNED_IN_HINT_KEY, '1');
  reloadDocumentHome();
  expect(store.has(SIGNED_IN_HINT_KEY)).toBe(false);
  expect(window.location.href).toBe('/');
});
