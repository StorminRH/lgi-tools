import { afterEach, expect, test, vi } from 'vitest';
import { isConvexConfigured, publicConvexUrl } from './public-env';

afterEach(() => vi.unstubAllEnvs());

test('the public Convex URL treats an empty value as unset and is read on every call', () => {
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', undefined);
  expect(publicConvexUrl()).toBeUndefined();
  expect(isConvexConfigured()).toBe(false);

  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '');
  expect(publicConvexUrl()).toBeUndefined();
  expect(isConvexConfigured()).toBe(false);

  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'http://127.0.0.1:3210');
  expect(publicConvexUrl()).toBe('http://127.0.0.1:3210');
  expect(isConvexConfigured()).toBe(true);
});
