import { afterEach, expect, test, vi } from 'vitest';
import {
  alignCardToRow,
  type AlignedLayer,
  type AlignedPanel,
  type MeasuredRow,
} from './ScannerAnchoredPanel';

afterEach(() => {
  vi.unstubAllGlobals();
});

function viewport(wide: boolean) {
  const queries: string[] = [];
  vi.stubGlobal('window', {
    matchMedia: (query: string) => {
      queries.push(query);
      return { matches: wide };
    },
  });
  return queries;
}

const rect = (top: number, bottom: number) =>
  ({ left: 0, right: 200, top, bottom }) as DOMRect;

function layer(clientHeight: number): AlignedLayer {
  return { clientHeight, getBoundingClientRect: () => rect(100, 100 + clientHeight) };
}

function panel(offsetHeight = 300): AlignedPanel & { readonly y: () => string } {
  const props = new Map<string, string>();
  return {
    offsetHeight,
    dataset: {},
    style: {
      getPropertyValue: (name: string) => props.get(name) ?? '',
      setProperty: (name: string, value: string | null) => {
        props.set(name, value ?? '');
      },
    },
    y: () => props.get('--scanner-card-y') ?? '',
  };
}

function row(top: number, bottom: number, clip?: { top: number; bottom: number }): MeasuredRow {
  return {
    getBoundingClientRect: () => rect(top, bottom),
    closest: (selector) =>
      clip !== undefined && selector === '[data-scanner-scroll]'
        ? { getBoundingClientRect: () => rect(clip.top, clip.bottom) }
        : null,
  };
}

test('floats the card above its row on wide viewports, clamped inside the layer', () => {
  viewport(true);
  const card = panel();
  // Layer spans 100..900; the card header rises 58px above the row middle.
  alignCardToRow(layer(800), card, row(300, 340));
  expect(card.y()).toBe('162px');
  expect(card.dataset.rowAligned).toBe('');

  alignCardToRow(layer(800), card, row(110, 130));
  expect(card.y()).toBe('16px');

  // 800 tall layer, 300 tall card, 48px float clearance.
  alignCardToRow(layer(800), card, row(900, 940));
  expect(card.y()).toBe('452px');

  // Only the visible slice of a row clipped by the scanner scroller counts.
  alignCardToRow(layer(800), card, row(300, 340, { top: 320, bottom: 600 }));
  expect(card.y()).toBe('172px');
});

test('holds an aligned card while its row is scrolled away, re-clamping to a shrunk layer', () => {
  viewport(true);
  const card = panel();
  const hidden = row(300, 340, { top: 400, bottom: 600 });

  // Never aligned: there is no held spot, so it aligns from the row anyway.
  alignCardToRow(layer(800), card, hidden);
  expect(card.dataset.rowAligned).toBe('');
  expect(card.y()).toBe('212px');

  alignCardToRow(layer(800), card, row(500, 540));
  expect(card.y()).toBe('362px');
  alignCardToRow(layer(800), card, hidden);
  expect(card.y()).toBe('362px');
  alignCardToRow(layer(500), card, hidden);
  expect(card.y()).toBe('152px');

  const blank = panel();
  blank.dataset.rowAligned = '';
  alignCardToRow(layer(800), blank, hidden);
  expect(blank.y()).toBe('');
});

test('releases the card to its CSS spot on narrow viewports or with no row', () => {
  const queries = viewport(false);
  const card = panel();
  card.dataset.rowAligned = '';
  card.style.setProperty('--scanner-card-y', '162px');
  alignCardToRow(layer(800), card, row(300, 340));
  expect(queries).toEqual(['(min-width: 1024px)']);
  expect(card.dataset.rowAligned).toBeUndefined();

  viewport(true);
  card.dataset.rowAligned = '';
  alignCardToRow(layer(800), card, null);
  expect(card.dataset.rowAligned).toBeUndefined();
});
