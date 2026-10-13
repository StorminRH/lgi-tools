import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import type { TreeNode } from '@/data/eve-data/types';
import { computeBatchLedger } from '../build-batch';
import type { IndustryProfileRow } from '../profiles/api-contract';
import { emptyProfileDocument } from '../profiles/profile-document';
import type { ProfilePlan } from '../profiles/profile-plan';
import type { BlueprintStructure } from '../types';

const tree: TreeNode[] = [
  {
    typeId: 10,
    quantity: 3,
    producedBy: { blueprintTypeId: 110, quantityPerRun: 2, runsNeeded: 1.5 },
    inputs: [
      {
        typeId: 20,
        quantity: 50,
        producedBy: { blueprintTypeId: 120, quantityPerRun: 40, runsNeeded: 1.25 },
        inputs: [{ typeId: 30, quantity: 5, inputs: [] }],
      },
      { typeId: 40, quantity: 7, inputs: [] },
    ],
  },
];
const structure = {
  tree,
  buildNodeDisplay: {
    10: { name: 'Capital Armor Plates', label: 'Capital Component', isRaw: false, height: 2, tone: 'green' },
    20: { name: 'Fernite Carbide', label: 'Reaction', isRaw: false, height: 1, tone: 'blue' },
  },
  materialNames: { 10: 'Capital Armor Plates', 20: 'Fernite Carbide', 30: 'Fernite', 40: 'Tritanium' },
  nodeActivityByBlueprint: { 110: 1, 120: 11 },
} as unknown as BlueprintStructure;

const h = vi.hoisted(() => ({
  profile: null as IndustryProfileRow | null,
  plan: null as ProfilePlan | null,
  feesPending: false,
  locationFailed: false,
  owned: new Map<number, { ownedQty: number }>(),
  net: null as {
    componentJobs: {
      jobs: { typeId: number; runs: number; systemId: number | null; fee: { total: number | null; missingAdjustedPriceTypeIds: number[] } }[];
    };
  } | null,
}));

vi.mock('@/components/ui/side-panel', () => ({
  SidePanel: ({ open, title, children }: { open: boolean; title: ReactNode; children: ReactNode }) =>
    open ? createElement('section', { 'data-title': title }, children) : null,
}));
vi.mock('@/components/use-system-search', () => ({
  useSystemsById: () => new Map([[30004759, { id: 30004759, name: '1DQ1-A', security: -0.4 }]]),
}));
vi.mock('./planner-contexts', () => ({
  useMarketData: () => ({
    refreshing: false,
    pricing: {
      rows: [
        { typeId: 30, unitBuy: 2 },
        { typeId: 40, unitBuy: 5 },
      ],
      intermediatePrices: [
        { typeId: 10, bestSell: 9_000, bestBuy: null },
        { typeId: 20, bestSell: 40, bestBuy: null },
      ],
      net: h.net,
    },
  }),
  useBuildSetup: () => ({ profile: h.profile, profilePlan: h.plan, feesPending: h.feesPending, locationFailed: h.locationFailed }),
  useBuildPlan: () => ({
    ledger: computeBatchLedger(tree, 1),
    ledgerMeOpts: { meOf: () => undefined, topBlueprintTypeId: 0 },
    ownedAssets: h.owned,
    ownedMe: null,
    ownedTe: null,
    meOverrides: new Map(),
    teOverrides: new Map(),
    setMeOverride: vi.fn(),
    resetMeOverride: vi.fn(),
    setTeOverride: vi.fn(),
    resetTeOverride: vi.fn(),
  }),
}));

import { ComponentDrawer } from './ComponentDrawer';

const render = (stack: number[]) =>
  renderToStaticMarkup(createElement(ComponentDrawer, { structure, stack, onStackChange: vi.fn() }));

beforeEach(() => {
  h.profile = null;
  h.plan = null;
  h.owned = new Map();
  h.net = null;
  h.feesPending = false;
  h.locationFailed = false;
});

test('a component job: its runs, build against buy, and its inputs, built ones opening deeper', () => {
  expect(render([])).toBe('');
  h.owned = new Map([[10, { ownedQty: 5 }]]);
  const html = render([10]);
  expect(html).toContain('data-title="Capital Armor Plates"');
  expect(html).toContain('Capital Component');
  expect(html).toContain('Manufacturing');
  expect(html).toContain('2 per run');
  // 3 needed, 2 runs of 2; 5 owned covers it.
  expect(html).toMatch(/Needed<\/dt><dd[^>]*>3</);
  expect(html).toMatch(/Runs<\/dt><dd[^>]*>2<span[^>]*>× 2/);
  expect(html).toMatch(/Owned<\/dt><dd[^>]*text-isk[^>]*>5</);
  // Building at 4,070 for 4 units beats buying at 9,000 a unit.
  expect(html).toMatch(/Build · per unit<\/dt><dd[^>]*text-isk/);
  expect(html).toContain('aria-label="Open Fernite Carbide"');
  expect(html).not.toContain('aria-label="Open Tritanium"');
  expect(html).toContain('Tritanium');
  expect(html).toContain('aria-label="Capital Armor Plates material efficiency"');
  expect(html).toContain('href="/industry/110"');
  expect(html).not.toContain('‹');
});

test('under a profile the job’s install fee shows and is part of a built unit; without one none is charged', () => {
  expect(render([10])).not.toContain('Install fee');
  h.net = { componentJobs: { jobs: [{ typeId: 10, runs: 2, systemId: 30004759, fee: { total: 930, missingAdjustedPriceTypeIds: [] } }] } };
  const html = render([10]);
  expect(html).toMatch(/Install fee<\/span><span[^>]*>930.00</);
  // (4,070 + 930) / 4 = 1,250 built still beats 9,000 bought.
  expect(html).toMatch(/Build · per unit<\/dt><dd[^>]*text-isk[^>]*><span[^>]*>1.3K</);
});

test('a deeper job leads back, names a reaction once, and takes no research', () => {
  const html = render([10, 20]);
  expect(html).toContain('data-title="Fernite Carbide"');
  expect(html).toContain('>‹ Capital Armor Plates<');
  expect(html.match(/>Reaction</g)).toHaveLength(1);
  expect(html).not.toContain('material efficiency');
  expect(html).toContain('href="/industry/120"');
});

test('under a profile the job shows where it runs and who runs it', () => {
  h.profile = {
    id: 'p',
    name: 'Main',
    revision: 1,
    document: emptyProfileDocument([{ characterId: 9001, name: 'Builder' }]),
    updatedAt: '2026-10-02T00:00:00.000Z',
  };
  h.plan = {
    routeOf: () => ({
      facility: { key: 'f', id: 's', name: '1DQ1-A Tatara', kind: 'structure', structure: null, systemId: 30004759, security: -0.4, categories: [] },
      characterId: 9001,
      bonus: null,
    }),
  } as unknown as ProfilePlan;
  const html = render([20]);
  expect(html).toContain('1DQ1-A Tatara');
  expect(html).toContain('1DQ1-A <span class="text-sec-null">-0.4</span>');
  expect(html).toContain('Builder');
});

test('a fee that counts an unpriced input as nothing shows amber and names it', () => {
  h.net = { componentJobs: { jobs: [{ typeId: 10, runs: 2, systemId: 30004759, fee: { total: 600, missingAdjustedPriceTypeIds: [40] } }] } };
  const html = render([10]);
  expect(html).toMatch(/Install fee<\/span><span[^>]*text-dps-mid[^>]*>600.00</);
  expect(html).toContain('Price Unavailable · Tritanium');
});


test('an unplaced job explains missing installation configuration without claiming prices are absent', () => {
  h.net = { componentJobs: { jobs: [{ typeId: 10, runs: 2, systemId: null, fee: { total: null, missingAdjustedPriceTypeIds: [20, 40] } }] } };
  const html = render([10]);
  expect(html).toContain('Choose an installation system to calculate fees.');
  expect(html).not.toContain('Price Unavailable');
  expect(html).toMatch(/Build · per unit<\/dt><dd[^>]*><span[^>]*>—</);
  expect(html).toContain('9.0K');
});

test.each(['pending', 'failed'])('an adjusted-price read that is %s does not claim inputs have no price', (status) => {
  h.feesPending = status === 'pending';
  h.locationFailed = status === 'failed';
  h.net = { componentJobs: { jobs: [{ typeId: 10, runs: 2, systemId: 30004759, fee: { total: null, missingAdjustedPriceTypeIds: [40] } }] } };
  const html = render([10]);
  expect(html).not.toContain('Price Unavailable');
  expect(html).toContain(status === 'pending' ? 'Loading installation fees…' : 'Installation fees could not be loaded. Retry in build setup.');
});
