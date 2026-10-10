import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import type { StructureRigOption, StructureTypeOption } from '@/data/eve-data/structures';
import type { CustomStructureRow } from '@/features/custom-structures/types';
import type { AvailableStructure } from '@/features/industry-planner/types';
import type { CorpStructurePageStructure, CorpStructurePageView } from '@/features/owned-structures/types';
import type { ReadIdentity } from '@/platform/auth/read-identity';

const SYSTEMS_BY_ID = new Map([
  [30002537, { id: 30002537, name: 'Amamake', security: 0.4 }],
  [30004759, { id: 30004759, name: '1DQ1-A', security: -0.4 }],
]);
const live = vi.hoisted(() => ({
  available: [] as AvailableStructure[],
  request: null as symbol | null,
  identity: { userId: 'account-a', characterId: 101 } as ReadIdentity | null,
  committed: false,
  runEffects: false,
  refresh: vi.fn(),
  save: null as ((structures: CustomStructureRow[], createdId?: string) => void) | null,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: live.refresh }) }));
vi.mock('@/lib/use-client-committed', () => ({ useClientCommitted: () => live.committed }));
vi.mock('@/platform/auth/components/AuthProvider', () => ({ useAuth: () => ({ loading: false }) }));
vi.mock('@/platform/auth/read-identity', () => ({
  useReadIdentity: () => live.identity,
  currentReadIdentity: () => live.identity,
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (effect: () => void) => { if (live.runEffects) effect(); },
}));
vi.mock('@/features/custom-structures/components/StructureComposer', () => ({
  StructureComposer: ({ onSaved }: { onSaved: (structures: CustomStructureRow[], createdId?: string) => void }) => {
    live.save = onSaved;
    return createElement('div', null, 'New structure');
  },
}));
vi.mock('./structures-panel', () => ({
  useNewStructureRequest: () => live.request,
  settleNewStructure: vi.fn(),
}));
vi.mock('@/components/use-system-search', () => ({ useSystemsById: () => SYSTEMS_BY_ID }));
vi.mock('@/features/industry-planner/use-available-structures', () => ({
  useAvailableStructures: () => live.available,
  refreshAvailableStructures: vi.fn(),
}));

import { savedStructure, StructuresManager } from './StructuresManager';
import { settleNewStructure } from './structures-panel';

const TYPES: StructureTypeOption[] = [
  { typeId: 35825, name: 'Raitaru', groupId: 1404, rigSize: 2 },
  { typeId: 35836, name: 'Tatara', groupId: 1406, rigSize: 3 },
];
const RIGS: StructureRigOption[] = [];
const OWNER = { userId: 'account-a', characterId: 101 };

beforeEach(() => {
  live.identity = OWNER;
  live.committed = false;
  live.runEffects = false;
  live.request = null;
  live.refresh.mockClear();
  live.save = null;
  vi.mocked(settleNewStructure).mockClear();
});

const flat = (f: number) => ({ high: f, low: f, null: f });
const available = (id: string, structureTypeId: number, groupId: number): AvailableStructure => ({
  id,
  source: id.startsWith('corp:') ? 'corp' : 'custom',
  name: id,
  structureTypeId,
  groupId,
  hostsCapitals: false,
  systemId: 30002537,
  targetFilterSets: [[]],
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

const render = (custom: CustomStructureRow[], corps: CorpStructurePageView[], owner = OWNER) =>
  renderToStaticMarkup(
    createElement(StructuresManager, { owner, structureTypes: TYPES, structureRigs: RIGS, initialCustom: custom, initialCorps: corps }),
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
  // Each row names its hull, then its system by id with that system's coloured security.
  expect(html).toContain('Raitaru · Amamake <span class="text-sec-04">0.4</span>');
  expect(html).toContain('Tatara · 1DQ1-A <span class="text-sec-null">-0.4</span>');
  expect(html).not.toContain('No structures yet.');
});

test('with nothing saved or shared there is nothing to filter', () => {
  live.available = [];
  const html = render([], []);
  expect(html).toContain('No structures yet.');
  expect(html).toContain('+ Add structure');
  expect(html).not.toContain('Show structures');
});

test('a profile asking for a new structure opens straight on its form', () => {
  live.available = [];
  live.request = Symbol();
  const html = render(CUSTOM, []);
  live.request = null;
  expect(html).toContain('New structure');
  expect(html).not.toContain('+ Add structure');
});

test('the structure a save added goes to the profile with its hull group', () => {
  const added = { ...CUSTOM[0]!, id: 'cs-3', name: 'Tatara 1DQ', structureTypeId: 35836, systemId: 30004759 };
  const fromAnotherTab = { ...CUSTOM[0]!, id: 'other-tab', name: 'Other tab structure' };
  expect(savedStructure([...CUSTOM, fromAnotherTab, added], 'cs-3', TYPES)).toEqual({
    id: 'cs-3',
    name: 'Tatara 1DQ',
    systemId: 30004759,
    groupId: 1406,
  });
  // An edit adds nothing, and an unknown hull can't say what it runs.
  expect(savedStructure(CUSTOM, 'cs-3', TYPES)).toBeNull();
  expect(savedStructure([...CUSTOM, { ...added, structureTypeId: 1 }], 'cs-3', TYPES)).toBeNull();
});

test.each([
  { userId: 'account-b', characterId: 202 },
  { userId: 'account-a', characterId: 202 },
])('a live identity change to %j masks the old server rows and requests fresh props', (identity) => {
  live.committed = true;
  live.runEffects = true;
  live.identity = identity;
  const html = render(CUSTOM, [corp(98000001, 'manage', [corpStructure(7)])]);
  expect(html).not.toContain('Amamake Raitaru');
  expect(html).not.toContain('Corp 98000001');
  expect(html).toContain('Loading custom structures');
  expect(live.refresh).toHaveBeenCalledOnce();

  const current = [{ ...CUSTOM[0]!, name: 'Current account Raitaru' }];
  const refreshed = render(current, [], identity);
  expect(refreshed).toContain('Current account Raitaru');
  expect(refreshed).not.toContain('Amamake Raitaru');
});

test('a late custom save cannot publish or deliver after the identity changes and returns', () => {
  live.committed = true;
  live.request = Symbol();
  render(CUSTOM, []);
  const save = live.save!;
  live.identity = { userId: OWNER.userId, characterId: OWNER.characterId };
  save(CUSTOM, 'cs-1');
  expect(vi.mocked(settleNewStructure)).not.toHaveBeenCalled();
});
