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
  expect(html).toMatch(/1DQ1-A <span[^>]*>-0.4<\/span>/);
  expect(html).toContain('Builder');
});

test('the install fee walks no profile, charged, an unpriced input, an unplaced job, and a pending or failed fee read', () => {
  expect(render([10])).not.toContain('Install fee');

  const job = (systemId: number | null, total: number | null, missingAdjustedPriceTypeIds: number[]) => ({
    componentJobs: { jobs: [{ typeId: 10, runs: 2, systemId, fee: { total, missingAdjustedPriceTypeIds } }] },
  });
  h.net = job(30004759, 930, []);
  const charged = render([10]);
  expect(charged).toMatch(/Install fee<\/span><span[^>]*>930.00</);
  // (4,070 + 930) / 4 = 1,250 built still beats 9,000 bought.
  expect(charged).toMatch(/Build · per unit<\/dt><dd[^>]*text-isk[^>]*><span[^>]*>1.3K</);

  // A fee that counts an unpriced input as nothing shows amber and names it.
  h.net = job(30004759, 600, [40]);
  const unpriced = render([10]);
  expect(unpriced).toMatch(/Install fee<\/span><span[^>]*text-dps-mid[^>]*>600.00</);
  expect(unpriced).toContain('Price Unavailable · Tritanium');

  // An unplaced job asks for a system instead of claiming prices are absent.
  h.net = job(null, null, [20, 40]);
  const unplaced = render([10]);
  expect(unplaced).toContain('Choose an installation system to calculate fees.');
  expect(unplaced).not.toContain('Price Unavailable');
  expect(unplaced).toMatch(/Build · per unit<\/dt><dd[^>]*><span[^>]*>—</);
  expect(unplaced).toContain('9.0K');

  // A pending or failed adjusted-price read does not claim inputs have no price.
  h.net = job(30004759, null, [40]);
  h.feesPending = true;
  const pending = render([10]);
  expect(pending).not.toContain('Price Unavailable');
  expect(pending).toContain('Loading installation fees…');

  h.feesPending = false;
  h.locationFailed = true;
  const failed = render([10]);
  expect(failed).not.toContain('Price Unavailable');
  expect(failed).toContain('Installation fees could not be loaded. Retry in build setup.');
});
