import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  requestNewStructure,
  setStructuresPanelOpen,
  settleNewStructure,
  useNewStructureAsked,
} from './structures-panel';

const pushState = vi.fn();
const SAVED = { id: 'cs-9', name: 'Perimeter Raitaru', systemId: 30000144, groupId: 1404 };

beforeEach(() => {
  pushState.mockReset();
  vi.stubGlobal('window', {
    location: { href: 'https://lgi.tools/industry?profile=p1' },
    history: { pushState },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('the drawer opens and closes through the address', () => {
  setStructuresPanelOpen(true);
  expect(pushState).toHaveBeenLastCalledWith(null, '', '/industry?profile=p1&panel=structures');
  setStructuresPanelOpen(false);
  expect(pushState).toHaveBeenLastCalledWith(null, '', '/industry?profile=p1');
});

test('a profile asking for a new structure gets it once saved, and the drawer closes', () => {
  const then = vi.fn();
  requestNewStructure(then);
  expect(pushState).toHaveBeenLastCalledWith(null, '', '/industry?profile=p1&panel=structures');

  settleNewStructure(SAVED);
  expect(then).toHaveBeenCalledWith(SAVED);
  expect(pushState).toHaveBeenLastCalledWith(null, '', '/industry?profile=p1');
});

test('a cancelled form or a closed drawer drops the ask', () => {
  const then = vi.fn();
  requestNewStructure(then);
  settleNewStructure(null);
  settleNewStructure(SAVED);

  requestNewStructure(then);
  setStructuresPanelOpen(false);
  settleNewStructure(SAVED);

  expect(then).not.toHaveBeenCalled();
});

test('no ask is open when the page is drawn on the server', () => {
  function Probe() {
    return String(useNewStructureAsked());
  }
  expect(renderToStaticMarkup(createElement(Probe))).toBe('false');
});
