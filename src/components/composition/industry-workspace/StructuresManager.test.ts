import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { StructureRigOption, StructureTypeOption } from '@/data/eve-data/structures';
import type { CustomStructureRow } from '@/features/custom-structures/types';
import type { AvailableStructure } from '@/features/industry-planner/types';
import type { CorpStructurePageStructure, CorpStructurePageView } from '@/features/owned-structures/types';

const SYSTEMS = [
  { id: 30002537, name: 'Amamake', security: 0.4 },
  { id: 30004759, name: '1DQ1-A', security: -0.4 },
];
const live = vi.hoisted(() => ({ available: [] as AvailableStructure[] }));
vi.mock('@/components/use-system-search', () => ({
  useSystemSearch: () => ({ systems: SYSTEMS, suggest: async () => [] }),
}));
vi.mock('@/features/industry-planner/use-available-structures', () => ({
  useAvailableStructures: () => live.available,
  refreshAvailableStructures: vi.fn(),
}));

import { StructuresManager } from './StructuresManager';

const TYPES: StructureTypeOption[] = [
  { typeId: 35825, name: 'Raitaru', groupId: 1404, rigSize: 2 },
  { typeId: 35836, name: 'Tatara', groupId: 1406, rigSize: 3 },
];
const RIGS: StructureRigOption[] = [];

const flat = (f: number) => ({ high: f, low: f, null: f });
const available = (id: string, structureTypeId: number, groupId: number): AvailableStructure => ({
  id,
  source: id.startsWith('corp:') ? 'corp' : 'custom',
  name: id,
  structureTypeId,
  groupId,
  systemId: 30002537,
  modifiers: [
    { activity: 'manufacturing', kind: 'material', filterId: null, factor: flat(0.99) },
    { activity: 'manufacturing', kind: 'time', filterId: null, factor: flat(0.85) },
  ],
  securityClass: null,
  taxPct: 1,
  enteredBonuses: null,
});

const CUSTOM: CustomStructureRow[] = [
  {
    id: 'cs-1',
    name: 'Amamake Raitaru',
    structureTypeId: 35825,
    rigTypeIds: [],
    systemId: 30002537,
    taxPct: 1.5,
    bonuses: null,
  },
  { id: 'cs-2', name: 'Unpinned Raitaru', structureTypeId: 35825, rigTypeIds: [], systemId: null, taxPct: null, bonuses: null },
];

const corpStructure = (structureId: number, over: Partial<CorpStructurePageStructure> = {}): CorpStructurePageStructure => ({
  structureId,
  typeId: 35836,
  systemId: 30004759,
  securityClass: 'null',
  name: `Tatara ${structureId}`,
  rigTypeIds: [],
  taxPct: 0.5,
  ...over,
});
const corp = (corporationId: number, structureAccess: CorpStructurePageView['structureAccess'], structures: CorpStructurePageStructure[]): CorpStructurePageView => ({
  corporationId,
  corporationName: `Corp ${corporationId}`,
  structureAccess,
  canManageSharing: structureAccess === 'manage',
  sharing: 'on',
  structures,
  lastRefreshedAt: null,
});

const render = (custom: CustomStructureRow[], corps: CorpStructurePageView[]) =>
  renderToStaticMarkup(
    createElement(StructuresManager, { structureTypes: TYPES, structureRigs: RIGS, initialCustom: custom, initialCorps: corps }),
  );

test('corporation structures and your own list side by side, with what each can do', () => {
  live.available = [available('cs-1', 35825, 1404), available('corp:7', 35836, 1406)];
  const html = render(CUSTOM, [
    corp(98000001, 'manage', [corpStructure(7), corpStructure(8, { rigTypeIds: [46486], name: null })]),
    corp(98000002, 'use', [corpStructure(9)]),
    corp(98000003, 'manage', []),
  ]);
  // Both kinds present, so the list can be narrowed to either.
  expect(html).toContain('All 5');
  expect(html).toContain('Corporation 3');
  expect(html).toContain('Yours 2');
  expect(html).toContain('+ Add structure');
  // A corporation with nothing shared is left out.
  expect(html).toContain('Corp 98000001');
  expect(html).not.toContain('Corp 98000003');
  // A manager sets rigs on a bare structure and edits a rigged one; a user does neither.
  expect(html).toContain('>Set rigs<');
  expect(html.match(/>Edit</g)).toHaveLength(3);
  // A nameless structure reads as its hull.
  expect(html).toContain('>Tatara<');
  expect(html).toContain('Amamake Raitaru');
  expect(html).toContain('Unpinned Raitaru');
  expect(html).not.toContain('No structures yet.');
});

test('with nothing saved or shared there is nothing to filter', () => {
  live.available = [];
  const html = render([], []);
  expect(html).toContain('No structures yet.');
  expect(html).toContain('+ Add structure');
  expect(html).not.toContain('Show structures');
});
