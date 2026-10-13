import { afterEach, expect, test, vi } from 'vitest';
import { SIGNED_IN_HINT_KEY, writeSignedInHint } from './signed-in-hint';

function stubWindow() {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });
  return { store };
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
