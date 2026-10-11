import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import type { StructureTypeOption } from '@/data/eve-data/structures';
import { settle } from '@/lib/__tests__/hook-runtime';
import {
  createCustomStructureEndpoint,
  deleteCustomStructureEndpoint,
  parseStructureFitEndpoint,
  updateCustomStructureEndpoint,
  type StructureSearchResult,
} from '../api-contract';
import type { StructureDraft } from '../structure-draft';
import type { CustomStructureRow } from '../types';

const h = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  suggest: vi.fn(async (_query: string): Promise<string[]> => []),
  hits: [] as StructureSearchResult[],
  systemsById: new Map([
    [30002537, { id: 30002537, name: 'Amamake', security: 0.4 }],
    [30004759, { id: 30004759, name: '1DQ1-A', security: -0.4 }],
  ]),
}));
// The composer runs on a minimal hook store so its handlers can be driven
// directly: each call re-reads the state its last handlers wrote.
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...rt.react,
}));
vi.mock('@/components/use-system-search', () => ({
  useSystemSearch: () => ({
    systems: [
      { id: 30002537, name: 'Amamake', security: 0.4 },
      { id: 30004759, name: '1DQ1-A', security: -0.4 },
    ],
    suggest: h.suggest,
  }),
  useSystemsById: () => h.systemsById,
}));
vi.mock('../use-structure-search', () => ({ useStructureSearch: () => h.hits }));
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));

import { StructureComposer } from './StructureComposer';

const TYPES: StructureTypeOption[] = [
  { typeId: 35825, name: 'Raitaru', groupId: 1404, rigSize: 2 },
  { typeId: 35836, name: 'Tatara', groupId: 1406, rigSize: 3 },
];
const EDITING: CustomStructureRow = {
  id: 'cs-1',
  name: 'Amamake Raitaru',
  structureTypeId: 35825,
  rigTypeIds: [],
  systemId: 30002537,
  taxPct: 1.5,
  bonuses: null,
};
const SAVED = [EDITING];

type Props = Record<string, unknown> & { children?: unknown };
type Handler = (...args: never[]) => unknown;

function* walk(node: unknown): Generator<Props> {
  if (Array.isArray(node)) {
    for (const child of node) yield* walk(child);
    return;
  }
  if (!isValidElement(node)) return;
  const props = node.props as Props;
  yield props;
  yield* walk(props.children);
}

function* elements(node: unknown): Generator<ReactElement> {
  if (Array.isArray(node)) {
    for (const child of node) yield* elements(child);
    return;
  }
  if (!isValidElement(node)) return;
  yield node;
  yield* elements((node.props as Props).children);
}

function mount(editing: CustomStructureRow | null) {
  rt.unmount();
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const render = () =>
    rt.render(StructureComposer, { structureTypes: TYPES, structureRigs: [], editing, onSaved, onClose }) as ReactElement;
  const find = (test: (props: Props) => boolean) => {
    for (const props of walk(render())) if (test(props)) return props;
    return null;
  };
  const element = (test: (props: Props) => boolean) => {
    for (const node of elements(render())) if (test(node.props as Props)) return node;
    return null;
  };
  const call = (test: (props: Props) => boolean, handler: string, ...args: unknown[]) =>
    (find(test)![handler] as Handler)(...(args as never[]));
  // The control inside the Field whose visible label reads `text`.
  const field = (text: string, handler: string, ...args: unknown[]) => {
    const control = find((p) => p.label === text && 'labelStyle' in p)!.children as ReactElement<Props>;
    return (control.props[handler] as Handler)(...(args as never[]));
  };
  return {
    onSaved,
    onClose,
    find,
    element,
    call,
    field,
    button: (text: string) => call((p) => p.children === text, 'onClick'),
    draft: () => rt.states[0] as StructureDraft,
    busy: () => rt.states[1] as boolean,
    error: () => find((p) => p.label === 'Check')?.children ?? null,
  };
}

/** The bonus section's tab bar, rendered from the section the composer last drew. */
function bonusTabs(c: ReturnType<typeof mount>): Props {
  const section = c.element(bonuses)!;
  const drawn = (section.type as (props: Props) => unknown)(section.props as Props);
  return [...walk(drawn)].find((p) => p.label === 'Structure bonuses')!;
}

const named = (p: Props) => 'onName' in p;
const system = (p: Props) => 'onType' in p;
const bonuses = (p: Props) => 'onReadFit' in p;

beforeEach(() => {
  h.apiFetch.mockReset();
  h.suggest.mockClear();
  h.hits = [];
});

test('a new structure says what is missing before it saves', () => {
  const c = mount(null);
  c.button('Save');
  expect(c.error()).toBe('Name the structure.');
  c.call(named, 'onName', 'x'.repeat(85));
  expect(c.draft().name).toBe('x'.repeat(80));
  expect(c.error()).toBeNull();
  c.button('Save');
  expect(c.error()).toBe('Pick the hull.');
  c.field('Hull', 'onValueChange', '35825');
  c.field('Facility tax', 'onChange', '12');
  c.button('Save');
  expect(c.error()).toBe('Tax must be 0–10%.');
  expect(h.apiFetch).not.toHaveBeenCalled();
});

test('picking a found structure fills its name, system and hull, clearing rigs when the hull changes', () => {
  const c = mount(null);
  c.call(named, 'onPick', { structureId: 1, name: 'Ashab Tatara', systemId: 30004759, structureTypeId: 35836 });
  expect(c.draft()).toMatchObject({ name: 'Ashab Tatara', systemId: 30004759, structureTypeId: 35836 });
  rt.states[0] = { ...c.draft(), rigSlots: [46486, null, null] };
  c.call(named, 'onPick', { structureId: 3, name: 'Other Tatara', systemId: 30004759, structureTypeId: 35836 });
  expect(c.draft().rigSlots).toEqual([46486, null, null]);
  // A found structure whose hull the search cannot tell keeps the hull and rigs already set.
  c.call(named, 'onPick', { structureId: 4, name: 'Unknown hull', systemId: 30002537, structureTypeId: null });
  expect(c.draft()).toMatchObject({ name: 'Unknown hull', systemId: 30002537, structureTypeId: 35836 });
  expect(c.draft().rigSlots).toEqual([46486, null, null]);
  c.call(named, 'onPick', { structureId: 2, name: 'Odd Keepstar', systemId: 30002537, structureTypeId: 35834 });
  expect(c.draft()).toMatchObject({ name: 'Odd Keepstar', systemId: 30002537, structureTypeId: null });
  expect(c.draft().rigSlots).toEqual([null, null, null]);
  // A found name is held to the length a typed one is.
  c.call(named, 'onPick', { structureId: 5, name: 'y'.repeat(85), systemId: 30002537, structureTypeId: null });
  expect(c.draft().name).toBe('y'.repeat(80));
  c.field('Hull', 'onValueChange', '35825');
  c.field('Hull', 'onValueChange', '');
  expect(c.draft().structureTypeId).toBeNull();
});

test('a found structure reads its hull, then its system with that system’s coloured security', () => {
  h.hits = [
    { structureId: 1, name: 'Found Tatara', systemId: 30004759, structureTypeId: 35836 },
    { structureId: 2, name: 'Unknown hull', systemId: 30002537, structureTypeId: null },
    { structureId: 3, name: 'Far Raitaru', systemId: 31000005, structureTypeId: 35825 },
    { structureId: 4, name: 'Nowhere', systemId: 31000005, structureTypeId: null },
  ];
  const c = mount(null);
  const field = c.element(named)!;
  const drawn = (field.type as (props: Props) => unknown)(field.props as Props);
  const options = [...walk(drawn)].find((p) => 'options' in p)!.options as { meta?: ReactNode }[];
  expect(options.map(({ meta }) => (meta ? renderToStaticMarkup(createElement('span', null, meta)) : null))).toEqual([
    '<span>Tatara · 1DQ1-A <span class="text-sec-null">-0.4</span></span>',
    '<span>Amamake <span class="text-sec-04">0.4</span></span>',
    '<span>Raitaru</span>',
    null,
  ]);
});

test('a typed system pins only on an exact name, and suggests the rest', async () => {
  const c = mount(null);
  h.suggest.mockResolvedValueOnce(['Amamake', 'Nowhere']);
  c.call(system, 'onType', 'ama');
  expect(c.draft().systemId).toBeNull();
  c.find(system);
  await settle();
  expect(c.find(system)!.sys).toMatchObject({ shown: 'ama', suggestions: [{ name: 'Amamake' }] });
  rt.hide();

  c.call(system, 'onType', ' AMAMAKE ');
  expect(c.draft().systemId).toBe(30002537);
  c.call(system, 'onPick', { id: 30004759, name: '1DQ1-A', security: -0.4 });
  expect(c.draft().systemId).toBe(30004759);
  expect(c.find(system)!.sys).toMatchObject({ shown: '1DQ1-A' });
});

test('saving a new structure creates it and hands back the list', async () => {
  const c = mount(null);
  c.call(named, 'onName', 'Home Raitaru');
  c.field('Hull', 'onValueChange', '35825');
  c.call(bonuses, 'onDraft', { bonus: { me: '1', te: '', cost: '', rxnMe: '', rxnTe: '' } });
  const createdId = '38534fe4-6d47-4007-8d99-0890bc6c9770';
  h.apiFetch.mockResolvedValueOnce({ ok: true, data: { structures: SAVED, createdId } });
  c.button('Save');
  expect(c.busy()).toBe(true);
  await settle();
  expect(h.apiFetch).toHaveBeenCalledWith(createCustomStructureEndpoint, {
    body: expect.objectContaining({ name: 'Home Raitaru', structureTypeId: 35825 }),
    cache: 'no-store',
  });
  expect(c.busy()).toBe(false);
  expect(c.onSaved).toHaveBeenCalledWith(SAVED, createdId);
});

test('an edited structure updates or deletes in place, and a failed save says so', async () => {
  const c = mount(EDITING);
  h.apiFetch.mockResolvedValueOnce({ ok: false });
  c.button('Save');
  await settle();
  expect(h.apiFetch).toHaveBeenCalledWith(updateCustomStructureEndpoint, {
    body: expect.objectContaining({ id: 'cs-1', name: 'Amamake Raitaru', bonuses: null }),
    cache: 'no-store',
  });
  expect(c.error()).toBe('Could not save. Try again.');
  expect(c.onSaved).not.toHaveBeenCalled();

  h.apiFetch.mockResolvedValueOnce({ ok: true, data: { structures: [] } });
  c.button('Delete');
  await settle();
  expect(h.apiFetch).toHaveBeenLastCalledWith(deleteCustomStructureEndpoint, { body: { id: 'cs-1' }, cache: 'no-store' });
  expect(c.onSaved).toHaveBeenCalledWith([], undefined);
  expect(c.find((p) => p['aria-label'] === 'Close')!.onClick).toBe(c.onClose);
});

test('a pasted fit sets the hull and rigs, and one without a structure is refused', async () => {
  const c = mount(null);
  h.apiFetch.mockResolvedValueOnce({
    ok: true,
    data: { parsed: { structureTypeId: 35836, rigTypeIds: [46486], name: 'Moon Tatara' } },
  });
  c.call(bonuses, 'onReadFit', '[Tatara, Moon Tatara]');
  await settle();
  expect(h.apiFetch).toHaveBeenCalledWith(parseStructureFitEndpoint, {
    body: { fit: '[Tatara, Moon Tatara]' },
    cache: 'no-store',
  });
  expect(c.draft()).toMatchObject({ name: 'Moon Tatara', structureTypeId: 35836, mode: 'rigs' });

  h.apiFetch.mockResolvedValueOnce({ ok: true, data: { parsed: null } });
  c.call(bonuses, 'onReadFit', 'junk');
  await settle();
  expect(c.error()).toBe('No structure in that fit.');
  h.apiFetch.mockResolvedValueOnce({ ok: false });
  c.call(bonuses, 'onReadFit', 'junk');
  await settle();
  expect(c.error()).toBe('No structure in that fit.');
});

test('the bonus tabs switch between typed values, rigs and a pasted fit, and a read fit lands on rigs', async () => {
  const c = mount(null);
  const choose = (tab: string) => (bonusTabs(c).onValueChange as Handler)(...([tab] as never[]));
  expect(bonusTabs(c).value).toBe('values');
  choose('rigs');
  expect(bonusTabs(c).value).toBe('rigs');
  expect(c.draft().mode).toBe('rigs');
  // Opening the fit keeps what would save until a fit is read.
  choose('fit');
  expect(bonusTabs(c).value).toBe('fit');
  expect(c.draft().mode).toBe('rigs');
  choose('values');
  expect(bonusTabs(c).value).toBe('values');
  expect(c.draft().mode).toBe('values');

  choose('fit');
  h.apiFetch.mockResolvedValueOnce({ ok: true, data: { parsed: { structureTypeId: 35825, rigTypeIds: [43920], name: null } } });
  c.call(bonuses, 'onReadFit', '[Raitaru, Line]');
  await settle();
  expect(bonusTabs(c).value).toBe('rigs');
  expect(c.draft().rigSlots).toEqual([43920, null, null]);
});
