import { expect, test } from 'vitest';
import {
  back,
  canInsert,
  chooseSource,
  layoutOptions,
  pickEntity,
  PICKER_START,
  previewView,
  setLayout,
  toNode,
  toggleField,
} from './data-block-picker-state';
import type { CodexSourceCatalogue } from '../components/CodexDataView';

const catalogue: CodexSourceCatalogue = {
  sources: [
    {
      id: 'wormholeType',
      label: 'Wormhole type',
      provenance: 'SDE',
      icon: 'wormhole',
      layouts: ['infobox', 'table', 'inline'],
      defaultFields: ['targetClass', 'totalMass', 'maxJumpMass', 'lifetimeMinutes'],
      fields: [
        { id: 'targetClass', label: 'Leads to' },
        { id: 'totalMass', label: 'Total mass' },
        { id: 'maxJumpMass', label: 'Max jump mass' },
        { id: 'lifetimeMinutes', label: 'Lifetime' },
        { id: 'massRegen', label: 'Mass regeneration' },
        { id: 'sizeClass', label: 'Size class' },
      ],
    },
    {
      id: 'site',
      label: 'Site',
      provenance: 'SDE · Prices',
      icon: 'site',
      layouts: ['infobox', 'table', 'inline', 'card'],
      defaultFields: ['wormholeClass'],
      fields: [{ id: 'wormholeClass', label: 'Class' }],
    },
  ],
};

const C247 = { key: 'C247', title: 'C247', href: null, values: [] };

test('walks from source to entity to fields with the source defaults and its first layout', () => {
  expect(chooseSource('wormholeType')).toEqual({ step: 'entity', source: 'wormholeType' });
  const picked = pickEntity(catalogue, 'wormholeType', C247);
  expect(picked).toMatchObject({
    step: 'fields',
    fields: ['targetClass', 'totalMass', 'maxJumpMass', 'lifetimeMinutes'],
    layout: 'infobox',
  });
  expect(back(picked)).toEqual({ step: 'entity', source: 'wormholeType' });
  expect(back(chooseSource('site'))).toEqual(PICKER_START);
});

test('toggles fields in catalogue order and ignores a layout the source does not offer', () => {
  const picked = pickEntity(catalogue, 'wormholeType', C247);
  const withRegen = toggleField(catalogue, toggleField(catalogue, picked, 'totalMass'), 'massRegen');
  expect(withRegen.fields).toEqual(['targetClass', 'maxJumpMass', 'lifetimeMinutes', 'massRegen']);
  expect(toggleField(catalogue, withRegen, 'totalMass').fields).toEqual([
    'targetClass',
    'totalMass',
    'maxJumpMass',
    'lifetimeMinutes',
    'massRegen',
  ]);
  expect(setLayout(catalogue, picked, 'card')).toBe(picked);
  expect(setLayout(catalogue, picked, 'table').layout).toBe('table');
});

test('inserts only with a field or a card, and the node carries no id', () => {
  const empty = { ...pickEntity(catalogue, 'wormholeType', C247), fields: [] };
  expect(canInsert(empty)).toBe(false);
  const card = setLayout(catalogue, { ...pickEntity(catalogue, 'site', { ...C247, key: '20' }), fields: [] }, 'card');
  expect(canInsert(card)).toBe(true);
  expect(toNode(card)).toEqual({ type: 'dataBlock', attrs: { source: 'site', key: '20', fields: [], layout: 'card' } });
  expect(layoutOptions(catalogue, 'site')).toHaveLength(4);
  expect(layoutOptions(catalogue, 'wormholeType').map((option) => option.label)).toEqual(['Infobox', 'Table', 'Inline']);
});

test('the inline layout becomes an inline node with no layout, so it sits inside the sentence', () => {
  const inline = setLayout(catalogue, pickEntity(catalogue, 'wormholeType', C247), 'inline');
  expect(toNode(inline)).toEqual({
    type: 'dataInline',
    attrs: { source: 'wormholeType', key: 'C247', fields: ['targetClass', 'totalMass', 'maxJumpMass', 'lifetimeMinutes'] },
  });
  expect(toNode(setLayout(catalogue, inline, 'table'))).toMatchObject({ type: 'dataBlock', attrs: { layout: 'table' } });
});

test('the preview shows the chosen values in catalogue order under the entity title', () => {
  const entity = {
    key: 'C247',
    title: 'C247',
    href: null,
    values: [
      { field: 'targetClass', label: 'Leads to', value: 'C3' },
      { field: 'totalMass', label: 'Total mass', value: '2,000,000,000 kg' },
      { field: 'lifetimeMinutes', label: 'Lifetime', value: '16 hours' },
    ],
  };
  const picked = { ...pickEntity(catalogue, 'wormholeType', entity), fields: ['totalMass', 'lifetimeMinutes'] };
  expect(previewView(catalogue, picked)).toEqual({
    source: 'wormholeType',
    sourceLabel: 'Wormhole type',
    provenance: 'SDE',
    icon: 'wormhole',
    title: 'C247',
    href: null,
    rows: [
      { field: 'totalMass', label: 'Total mass', value: '2,000,000,000 kg' },
      { field: 'lifetimeMinutes', label: 'Lifetime', value: '16 hours' },
    ],
  });
});
