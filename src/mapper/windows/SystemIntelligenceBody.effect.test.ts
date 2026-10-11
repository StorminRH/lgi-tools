import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';
import type { WormholeCodex } from '@/data/eve-data/universe-assets-client';

// Render every disclosure expanded so the effect's modifier list and the
// Friendlies list are in the markup.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: <T>(initial: T) => actual.useState(initial === false ? true : initial),
  };
});

const h = vi.hoisted(() => ({
  whClassId: 5,
  status: { codex: null, failed: false } as { codex: WormholeCodex | null; failed: boolean },
  entityNames: vi.fn((ids: readonly number[]) =>
    Object.fromEntries(ids.filter((id) => id === 8).map((id) => [String(id), 'Bravo Pilot']))),
}));

vi.mock('@/data/eve-data/use-names', () => ({
  useEntityNames: h.entityNames,
  useTypeNames: () => ({ '100': 'Astero' }),
}));
vi.mock('@/components/use-account-characters', () => ({
  useAccountCharacters: () => [
    { characterId: 7, name: 'Alpha Pilot', portraitUrl: '/alpha.png', needsReconnect: false, needsLocationReconnect: false },
  ],
}));
vi.mock('../signatures/signature-context', () => ({ useSignatureRows: () => [] }));
vi.mock('../signatures/use-system-statics', () => ({ useSystemStaticSlots: () => [] }));
vi.mock('@/data/eve-data/use-universe-assets', () => ({
  useWormholeCodexStatus: () => h.status,
  useUniverseAssets: () => ({
    systemInfo: (): SystemDirectoryEntry => ({
      id: 1, name: 'J123456', regionName: 'Test Region', security: -1, whClassId: h.whClassId, effect: 'pulsar',
    }),
  }),
}));

import { MapPresenceContext } from '../tracking/presence-context';
import type { SystemPresence } from '../tracking/presence-model';
import { SystemIntelligenceBody } from './SystemIntelligenceBody';

function effectMarkup(): string {
  const html = renderToStaticMarkup(createElement(SystemIntelligenceBody, { systemId: 1 }));
  return html.slice(html.indexOf('data-intel-effect'));
}

function codexWith(effect: WormholeCodex['effect']): WormholeCodex {
  return { version: 'v1', byCode: () => null, codes: () => [], effect };
}

test('an expanded effect waits for the codex, then lists signed modifiers for the system class', () => {
  expect(effectMarkup()).toContain('>Pulsar<');
  expect(effectMarkup()).toContain('Loading effects…');

  h.status = { codex: null, failed: true };
  expect(effectMarkup()).toContain('Effect details are unavailable right now.');

  const effect = vi.fn<WormholeCodex['effect']>(() => ({
    effect: 'pulsar',
    wormholeClass: 5,
    typeId: 30_845,
    modifiers: [
      { attributeId: 1, label: 'Shield HP', percent: 44 },
      { attributeId: 2, label: 'Armor resistances', percent: -22 },
    ],
  }));
  h.status = { codex: codexWith(effect), failed: false };
  const listed = effectMarkup();
  expect(effect).toHaveBeenCalledWith('pulsar', 5);
  expect(listed).toContain('data-intel-effect-modifiers');
  expect(listed).toMatch(/Shield HP<\/span><span[^>]*>\+44%</);
  expect(listed).toMatch(/Armor resistances<\/span><span[^>]*>−22%</);
  expect(listed.indexOf('Shield HP')).toBeLessThan(listed.indexOf('Armor resistances'));

  effect.mockReturnValue({ effect: 'pulsar', wormholeClass: 5, typeId: 30_845, modifiers: [] });
  expect(effectMarkup()).toContain('No effect data for this class.');

  effect.mockReturnValue(null);
  expect(effectMarkup()).toContain('No effect data for this class.');

  h.whClassId = 2;
  effectMarkup();
  expect(effect).toHaveBeenLastCalledWith('pulsar', 2);
});

test('expanded Friendlies name own pilots from the roster and look up only the others', () => {
  const presence = new Map<number, SystemPresence>([[1, {
    pilots: [
      { characterId: 7, shipTypeId: 100, docked: false, lastMovementAt: 3 },
      { characterId: 8, shipTypeId: 100, docked: true, lastMovementAt: 2 },
      { characterId: 9, shipTypeId: 100, docked: false, lastMovementAt: 1 },
    ],
  }]]);
  const html = renderToStaticMarkup(createElement(
    MapPresenceContext.Provider,
    { value: presence },
    createElement(SystemIntelligenceBody, { systemId: 1 }),
  ));
  const rows = [...html.matchAll(/data-presence-pilot="(\d+)"[^>]*><span[^>]*>([^<]*)<\/span><span[^>]*>([^<]*)</g)]
    .map(([, id, name, status]) => [Number(id), name, status]);

  expect(h.entityNames).toHaveBeenLastCalledWith([8, 9]);
  expect(rows).toEqual([
    [7, 'Alpha Pilot', 'Astero'],
    [8, 'Bravo Pilot', 'Docked'],
    [9, 'Character 9', 'Astero'],
  ]);
});
