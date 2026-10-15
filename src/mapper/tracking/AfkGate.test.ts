import { afterEach, expect, test, vi } from 'vitest';

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', () => rt.react);

vi.mock('@/components/ui/button', () => ({ Button: () => null }));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: () => null,
  DialogBody: () => null,
  DialogClose: () => null,
  DialogDescription: () => null,
  DialogFooter: () => null,
  DialogHeader: () => null,
}));

import { ACTIVE_AFK_STATE } from './afk-model';
import { useAfkState } from './AfkGate';

const NOW = 1_750_000_000_000;

function mountIn(visibilityState: DocumentVisibilityState) {
  vi.stubGlobal('document', { visibilityState, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  rt.unmount();
  rt.render(useAfkState);
  return rt.states[0];
}

afterEach(() => {
  rt.unmount();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('a tab mounted in the background starts its hidden clock once mounted', () => {
  vi.useFakeTimers({ now: NOW });
  expect(mountIn('hidden')).toEqual({ phase: 'active', hiddenSince: NOW, promptedAt: null });
});

test('a visible mount stays on the active state', () => {
  vi.useFakeTimers({ now: NOW });
  expect(mountIn('visible')).toBe(ACTIVE_AFK_STATE);
});
