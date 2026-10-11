import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { StructureRigOption, StructureTypeOption } from '@/data/eve-data/structures';
import type { CustomStructureRow } from '../types';

const SYSTEMS = [
  { id: 30002537, name: 'Amamake', security: 0.4 },
  { id: 30004759, name: '1DQ1-A', security: -0.4 },
  { id: 30000001, name: 'Highsec', security: 0.5 },
  { id: 30000002, name: 'Lowsec', security: 0.3 },
  { id: 30000003, name: 'Nullsec', security: -0.2 },
  { id: 30000004, name: 'Unsurveyed', security: null },
];
const SYSTEMS_BY_ID = new Map(SYSTEMS.map((system) => [system.id, system]));
vi.mock('@/components/use-system-search', () => ({
  useSystemSearch: () => ({ systems: SYSTEMS, suggest: async () => [] }),
  useSystemsById: () => SYSTEMS_BY_ID,
}));
vi.mock('../use-structure-search', () => ({
  useStructureSearch: () => [{ structureId: 1035, name: 'Found Fortizar', systemId: 30002537, structureTypeId: 35833 }],
}));

import { StructureComposer } from './StructureComposer';

const TYPES: StructureTypeOption[] = [
  { typeId: 35825, name: 'Raitaru', groupId: 1404, rigSize: 2 },
  { typeId: 35836, name: 'Tatara', groupId: 1406, rigSize: 3 },
  { typeId: 35833, name: 'Fortizar', groupId: 1657, rigSize: 3 },
];
const RIGS: StructureRigOption[] = [
  { typeId: 43920, name: 'Standup M-Set Equipment Manufacturing Material Efficiency I', canFitGroups: [1404], rigSize: 2 },
];

const row = (over: Partial<CustomStructureRow>): CustomStructureRow => ({
  id: 'cs-1',
  name: 'Amamake Raitaru',
  structureTypeId: 35825,
  rigTypeIds: [43920],
  systemId: 30002537,
  taxPct: 1.5,
  bonuses: null,
  ...over,
});

const render = (editing: CustomStructureRow | null) =>
  renderToStaticMarkup(
    createElement(StructureComposer, {
      structureTypes: TYPES,
      structureRigs: RIGS,
      editing,
      onSaved: vi.fn(),
      onClose: vi.fn(),
    }),
  );

/** The pinned system's security pill: its tone variable and its text. */
const secPill = (html: string) => {
  const [, tone, text] = /<span class="[^"]*pill-soft[^"]*\[--pill-tone:var\(([^)]+)\)\][^"]*">([^<]*)<\/span>/.exec(html) ?? [];
  return { tone, text };
};
const tabs = (html: string) => [...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map(([, name]) => name);
const selectedTab = (html: string) => /role="tab" aria-selected="true"[^>]*>([^<]+)</.exec(html)?.[1];

test('a new structure starts unnamed and unpinned, with typed values for manufacturing only', () => {
  const html = render(null);
  expect(html).toContain('aria-label="New structure"');
  expect(html).not.toContain('>Delete<');
  expect(tabs(html)).toEqual(['Bonuses', 'Rigs', 'Paste fit']);
  expect(selectedTab(html)).toBe('Bonuses');
  expect(html).toContain('aria-label="Manufacturing material bonus"');
  expect(html).not.toContain('aria-label="Reaction material bonus"');
});

test('a rigged structure opens on its rigs, pinned to its system with that system’s security', () => {
  const html = render(row({}));
  expect(html).toContain('aria-label="Edit structure"');
  expect(html).toContain('>Delete<');
  expect(selectedTab(html)).toBe('Rigs');
  expect(html).toContain('aria-label="Rig slot 1"');
  expect(html).not.toContain('aria-label="Manufacturing material bonus"');
  expect(html).toContain('value="Amamake"');
  expect(html).toContain('>0.4<');
});

test('a refinery with typed values offers its reaction bonuses too', () => {
  const html = render(
    row({
      name: '1DQ1-A Tatara',
      structureTypeId: 35836,
      rigTypeIds: [],
      systemId: 30004759,
      bonuses: { manufacturing: { me: 0, te: 0, cost: 0 }, reactions: { me: 2.4, te: 25 } },
    }),
  );
  expect(selectedTab(html)).toBe('Bonuses');
  expect(html).toContain('aria-label="Reaction material bonus"');
  expect(html).toContain('aria-label="Reaction time bonus"');
  expect(html).toContain('>-0.4<');
});

test.each([
  [30000001, '0.5', '--color-isk'],
  [30000002, '0.3', '--color-tone-orange'],
  [30000003, '-0.2', '--color-alert-red'],
  // An unknown security reads neutral, not as null-sec.
  [30000004, '—', '--color-muted'],
])('a structure pinned to system %i shows security %s in the %s tone', (systemId, text, tone) => {
  expect(secPill(render(row({ systemId, rigTypeIds: [] })))).toEqual({ tone, text });
});
