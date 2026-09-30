import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';
import type { WormholeCodex } from '@/data/eve-data/universe-assets-client';

// Render every disclosure expanded so the effect's modifier list is in the markup.
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
}));

vi.mock('@/components/use-entity-names', () => ({ useEntityNames: () => ({}) }));
vi.mock('../tracking/presence-context', () => ({ useSystemPresence: () => null }));
vi.mock('../signatures/signature-context', () => ({ useSignatureRows: () => [] }));
vi.mock('../signatures/use-system-statics', () => ({
  useSystemStaticSlots: () => [],
  useWormholeCodexStatus: () => h.status,
}));
vi.mock('../chain/use-universe-assets', () => ({
  useUniverseAssets: () => ({
    systemInfo: (): SystemDirectoryEntry => ({
      id: 1, name: 'J123456', regionName: 'Test Region', security: -1, whClassId: h.whClassId, effect: 'pulsar',
    }),
  }),
}));

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
