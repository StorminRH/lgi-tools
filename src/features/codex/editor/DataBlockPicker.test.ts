import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock('@/transport/api-client', () => ({ apiFetch }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => createElement('a', { href }, children),
}));

import { PICKER_START, type FieldsState } from './data-block-picker-state';
import type { CodexSourceCatalogue } from '../components/CodexDataView';
import {
  createEntityLoader,
  DataBlockPicker,
  EntityStep,
  FieldsStep,
  handleFieldKey,
  PickerFooter,
  PickerPanel,
} from './DataBlockPicker';

const catalogue: CodexSourceCatalogue = {
  sources: [
    {
      id: 'wormholeType',
      label: 'Wormhole type',
      provenance: 'SDE',
      icon: 'wormhole',
      layouts: ['infobox', 'table', 'inline'],
      defaultFields: ['targetClass', 'totalMass'],
      fields: [
        { id: 'targetClass', label: 'Leads to' },
        { id: 'totalMass', label: 'Total mass' },
        { id: 'sizeClass', label: 'Size class' },
      ],
    },
    {
      id: 'site',
      label: 'Site',
      provenance: 'SDE · Prices',
      icon: 'site',
      layouts: ['infobox', 'table', 'inline', 'card'],
      defaultFields: [],
      fields: [{ id: 'siteType', label: 'Type' }],
    },
  ],
};

const fields = (overrides: Partial<FieldsState> = {}): FieldsState => ({
  step: 'fields',
  source: 'wormholeType',
  entity: {
    key: 'C247',
    title: 'C247',
    href: null,
    values: [
      { field: 'targetClass', label: 'Leads to', value: 'C3' },
      { field: 'totalMass', label: 'Total mass', value: '2,000,000,000 kg' },
      { field: 'sizeClass', label: 'Size class', value: 'Large · up to battleships' },
    ],
  },
  fields: ['targetClass', 'totalMass'],
  layout: 'infobox',
  ...overrides,
});

const html = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element);
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const noop = () => undefined;

test('the closed picker is only the Data trigger, outside any panel', () => {
  const markup = html(
    createElement(DataBlockPicker, {
      catalogue,
      open: false,
      onOpenChange: noop,
      onInsert: noop,
      trigger: 'Data',
      triggerClassName: 'tool',
      anchor: { current: null },
    }),
  );
  expect(markup).toMatch(/^<button [^>]*aria-label="Insert data block"/);
  expect(markup).toContain('aria-expanded="false"');
  expect(text(markup)).toBe('Data');
});

test('step one offers every source with the rail on its first step and a cancel button', () => {
  const markup = html(createElement(PickerPanel, { catalogue, onInsert: noop, onClose: noop }));
  expect(text(markup)).toBe('1 Source 2 Entity 3 Fields &amp; layout Choose a source Wormhole type Site Cancel');
  expect(markup).toMatch(/<li [^>]*aria-current="step"[^>]*>(?:(?!<\/li>).)*Source/);
});

test('step two is a search field named for the chosen source', () => {
  const markup = html(createElement(EntityStep, { source: 'site', label: 'Site', onPick: noop }));
  expect(markup).toContain('aria-label="Search Site"');
  expect(markup).toContain('placeholder="Search site"');
  expect(markup).toContain('role="combobox"');
});

test('step three ticks the chosen fields beside their live values and previews the layout', () => {
  const markup = html(createElement(FieldsStep, { catalogue, state: fields(), onChange: noop }));
  expect(markup.match(/role="checkbox"[^>]*aria-checked="true"|aria-checked="true"[^>]*role="checkbox"/g)).toHaveLength(2);
  expect(text(markup)).toContain('Size class Large · up to battleships');
  expect(markup).toContain('data-codex-layout="infobox"');
  expect(text(markup)).toContain('Properties SDE');
  expect(text(markup)).toContain('Values come from the game data and update when it does.');
});

test('the inline preview sits inside a sentence and the card layout says it shows the site card', () => {
  const inline = html(createElement(FieldsStep, { catalogue, state: fields({ layout: 'inline' }), onChange: noop }));
  expect(inline).toMatch(/<p [^>]*><span data-codex-block="wormholeType" data-codex-layout="inline">/);
  expect(text(inline)).toContain('C247 — leads to C3 · total mass 2,000,000,000 kg');

  const card = html(
    createElement(FieldsStep, {
      catalogue,
      state: fields({ source: 'site', fields: [], layout: 'card' }),
      onChange: noop,
    }),
  );
  expect(text(card)).toContain('Shows as the full site card on the page.');
});

test('the footer counts fields and inserts only with a field or a card', () => {
  const footer = (state: FieldsState) =>
    html(createElement(PickerFooter, { catalogue, state, onBack: noop, onInsert: noop }));
  expect(text(footer(fields()))).toBe('← Back 2 of 3 fields Insert block');
  expect(footer(fields())).not.toMatch(/ disabled=""[^>]*>Insert block/);
  expect(footer(fields({ fields: [] }))).toMatch(/ disabled=""[^>]*>Insert block/);
  expect(footer(fields({ source: 'site', fields: [], layout: 'card' }))).not.toMatch(/ disabled=""[^>]*>Insert block/);
});

test('Enter on a field toggles it and stops the editor form from submitting', () => {
  const toggle = vi.fn();
  const preventDefault = vi.fn();
  handleFieldKey({ key: 'Enter', preventDefault }, toggle);
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(toggle).toHaveBeenCalledOnce();

  handleFieldKey({ key: ' ', preventDefault }, toggle);
  handleFieldKey({ key: 'Tab', preventDefault }, toggle);
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(toggle).toHaveBeenCalledOnce();
  expect(apiFetch).not.toHaveBeenCalled();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const entity = (key: string) => ({ key, title: key, href: null, values: [] });
const found = (key: string) => ({ ok: true, data: { entity: entity(key) } });

test('when an earlier entity load lands after a later pick, the later pick wins', async () => {
  const first = deferred<unknown>();
  const second = deferred<unknown>();
  apiFetch.mockReset().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const loading = vi.fn();
  const picked = vi.fn();
  const loader = createEntityLoader({ loading, problem: vi.fn(), step: vi.fn() });

  const a = loader.load('wormholeType', { key: 'C247', title: 'C247', hint: '' }, picked);
  const b = loader.load('wormholeType', { key: 'D382', title: 'D382', hint: '' }, picked);
  second.resolve(found('D382'));
  await b;
  first.resolve(found('C247'));
  await a;

  expect(picked.mock.calls).toEqual([[entity('D382')]]);
  expect(loading.mock.calls.at(-1)).toEqual([null]);
});

test('going back or changing source drops the entity load still in flight', async () => {
  const pending = deferred<unknown>();
  apiFetch.mockReset().mockReturnValueOnce(pending.promise);
  const loading = vi.fn();
  const problem = vi.fn();
  const step = vi.fn();
  const picked = vi.fn();
  const loader = createEntityLoader({ loading, problem, step });

  const load = loader.load('site', { key: '20', title: 'Outpost', hint: '' }, picked);
  loader.move(PICKER_START);
  pending.resolve(found('20'));
  await load;

  expect(picked).not.toHaveBeenCalled();
  expect(step.mock.calls).toEqual([[PICKER_START]]);
  expect(problem.mock.calls).toEqual([[null]]);
  expect(loading.mock.calls).toEqual([['Outpost'], [null]]);
});

test('a field value shows in full, wrapping rather than clipping', () => {
  const markup = html(createElement(FieldsStep, { catalogue, state: fields(), onChange: noop }));
  const value = markup.match(/<span class="([^"]*)">Large · up to battleships<\/span>/);
  expect(value?.[1]).not.toMatch(/\btruncate\b/);
});
