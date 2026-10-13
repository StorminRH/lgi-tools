import { expect, test, vi } from 'vitest';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import type { WormholeCodex } from '@/data/eve-data/universe-assets-client';

const h = vi.hoisted(() => ({
  codex: null as WormholeCodex | null,
  statics: new Map<number, Promise<readonly string[]>>(),
}));
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', () => rt.react);
vi.mock('@/data/eve-data/use-universe-assets', () => ({
  useWormholeCodex: () => h.codex,
}));
vi.mock('@/data/wh-statics/client', () => ({
  loadSystemStatics: (systemId: number) =>
    h.statics.get(systemId) ?? new Promise<readonly string[]>(() => {}),
}));

import { settle } from '@/lib/__tests__/hook-runtime';
import { useWormholeEditorData } from './use-wormhole-editor-data';

const B274: WormholeCodexEntry = {
  code: 'B274',
  typeId: 1,
  farSide: false,
  totalMass: 2_000_000_000,
  maxJumpMass: 375_000_000,
  massRegen: 0,
  lifetimeMinutes: 960,
  sizeClass: 'L',
  targetClass: 7,
};

test('editor data holds one empty code list until the codex and the statics load', async () => {
  const noSystem = rt.render(useWormholeEditorData, 0, 'B274');
  const noSystemAgain = rt.render(useWormholeEditorData, 0, 'B274');
  expect(noSystem.codes).toEqual([]);
  expect(noSystem.preferredCodes).toEqual([]);
  expect(noSystem.entry).toBeNull();
  expect(noSystemAgain.codes).toBe(noSystem.codes);
  expect(noSystemAgain.preferredCodes).toBe(noSystem.preferredCodes);
  rt.unmount();

  let resolveStatics: (codes: readonly string[]) => void = () => {};
  h.statics.set(31_000_001, new Promise((resolve) => { resolveStatics = resolve; }));
  const loading = rt.render(useWormholeEditorData, 31_000_001, 'B274');
  expect(rt.render(useWormholeEditorData, 31_000_001, 'B274').preferredCodes)
    .toBe(loading.preferredCodes);

  const codexCodes = ['B274', 'K162'];
  h.codex = {
    version: 'v1',
    byCode: (code) => (code === 'B274' ? B274 : null),
    codes: () => codexCodes,
    effect: () => null,
  };
  resolveStatics(['B274']);
  await settle();
  const loaded = rt.render(useWormholeEditorData, 31_000_001, 'B274');
  expect(loaded.codes).toBe(codexCodes);
  expect(loaded.entry).toBe(B274);
  expect(loaded.preferredCodes).toEqual(['B274']);
  rt.unmount();
  h.codex = null;
});
