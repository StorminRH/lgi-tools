import { expect, test, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  state: { session: null as { characterId: number } | null, loading: true },
}));

vi.mock('react', () => ({
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));
vi.mock('@/platform/auth/components/AuthProvider', () => ({ useAuth: () => auth.state }));

import { createRememberedRead, useRememberedRead } from './remembered-read';

test('a remembered read shows the last result to the session that read it, and nothing once signed out', () => {
  const memory = createRememberedRead<{ rows: number }>();
  expect(useRememberedRead(memory)).toBeNull();

  memory.set({ rows: 2 });
  // While the session resolves, the last result is still this document's own.
  expect(useRememberedRead(memory)).toEqual({ rows: 2 });

  auth.state = { session: { characterId: 7 }, loading: false };
  expect(useRememberedRead(memory)).toEqual({ rows: 2 });

  auth.state = { session: null, loading: false };
  expect(useRememberedRead(memory)).toBeNull();
});
