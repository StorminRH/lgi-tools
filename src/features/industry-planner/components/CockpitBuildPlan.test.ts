import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { BlueprintStructure } from '../types';

vi.mock('./planner-contexts', () => ({
  useMarketData: () => ({ pricing: null, refreshing: false }),
  useBuildPlan: () => ({
    ownedMe: null,
    ownedDetail: null,
    ownedAssets: null,
    ownedTe: null,
    meOverrides: new Map(),
    setMeOverride: vi.fn(),
    resetMeOverride: vi.fn(),
    teOverrides: new Map(),
    setTeOverride: vi.fn(),
    resetTeOverride: vi.fn(),
    ledger: { raws: new Map([[34, 500]]), builds: new Map() },
  }),
}));

import { CockpitBuildPlan } from './CockpitBuildPlan';

const render = (structure: BlueprintStructure) =>
  renderToStaticMarkup(createElement(CockpitBuildPlan, { structure, onOpen: vi.fn() }));

test('a blueprint with no resolved inputs shows the shared empty row in place of the tier columns', () => {
  const empty = render({ buildTree: [], buildNodeDisplay: {}, materialNames: {} } as unknown as BlueprintStructure);
  expect(empty).toMatch(
    /^<div class="reveal reveal-3"><div class="[^"]*"><div class="[^"]*border-b[^"]*"><svg aria-hidden="true"[^>]*>.*<\/svg><div class="min-w-0">No build breakdown — this blueprint has no resolved inputs yet\.<\/div><\/div><\/div><\/div>$/,
  );
  expect(empty).not.toContain('Tier 1');

  const built = render({
    buildTree: [{ typeId: 587, quantity: 1, inputs: [{ typeId: 34, quantity: 500, inputs: [] }] }],
    buildNodeDisplay: {
      587: { name: 'Rifter', height: 1, isRaw: false, label: 'Ship', tone: 'teal' },
      34: { name: 'Tritanium', height: 0, isRaw: true, label: 'Mineral', tone: 'neutral' },
    },
    materialNames: { 587: 'Rifter', 34: 'Tritanium' },
  } as unknown as BlueprintStructure);
  expect(built).toContain('Tier 1');
  expect(built).toContain('Tritanium');
  expect(built).not.toContain('No build breakdown');
});
