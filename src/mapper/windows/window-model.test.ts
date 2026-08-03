import { describe, expect, it } from 'vitest';
import {
  bringToFront,
  clampRect,
  deriveSurfaces,
  dragRect,
  keydownAction,
  reconcileStack,
  resizeRect,
  surfaceKindOf,
  topmost,
} from './window-model';

const base = {
  rootSystemId: 1,
  dockHidden: false,
  selectedIds: [] as number[],
  boxSelectActive: false,
  rootClick: null,
  consumedRootClickToken: 0,
};

describe('map window presence', () => {
  it('keeps the root dock standing independently of selection', () => {
    expect(deriveSurfaces(base).surfaces).toEqual(['dock']);
    expect(deriveSurfaces({ ...base, selectedIds: [1] }).surfaces).toEqual(['dock']);
    expect(deriveSurfaces({ ...base, rootSystemId: null }).surfaces).toEqual([]);
  });

  it('reopens a hidden dock on a fresh root click even when the root was selected', () => {
    const result = deriveSurfaces({
      ...base,
      dockHidden: true,
      selectedIds: [1],
      rootClick: { systemId: 1, token: 4 },
      consumedRootClickToken: 3,
    });

    expect(result).toEqual({
      surfaces: ['dock'],
      summarySystemId: null,
      dockHidden: false,
      consumedRootClickToken: 4,
    });
    expect(
      deriveSurfaces({
        ...base,
        dockHidden: true,
        rootClick: { systemId: 1, token: 4 },
        consumedRootClickToken: 4,
      }).dockHidden,
    ).toBe(true);
  });

  it('shows a card only for one settled non-root selection', () => {
    expect(deriveSurfaces({ ...base, selectedIds: [2] })).toMatchObject({
      surfaces: ['dock', 'summary'],
      summarySystemId: 2,
    });
    expect(
      deriveSurfaces({ ...base, selectedIds: [2], boxSelectActive: true }),
    ).toMatchObject({ surfaces: ['dock'], summarySystemId: null });
    expect(deriveSurfaces({ ...base, selectedIds: [2, 3] })).toMatchObject({
      surfaces: ['dock'],
      summarySystemId: null,
    });
  });
});

describe('map window keyboard and stack', () => {
  it('derives Escape surface kind from placement alone', () => {
    expect(surfaceKindOf({ kind: 'docked' })).toBe('dock');
    expect(
      surfaceKindOf({
        kind: 'floating',
        rect: { x: 0, y: 0, width: 380, height: 520 },
      }),
    ).toBe('dock');
    expect(surfaceKindOf({ kind: 'node-anchored', systemId: 2 })).toBe('card');
  });

  it('dismisses only a card Escape that no popup already owns', () => {
    expect(
      keydownAction({
        key: 'Escape',
        surfaceKind: 'card',
        popupOpen: false,
        defaultPrevented: false,
      }),
    ).toBe('dismiss-card');
    for (const input of [
      { key: 'Escape', surfaceKind: 'dock' as const, popupOpen: false, defaultPrevented: false },
      { key: 'Escape', surfaceKind: 'card' as const, popupOpen: true, defaultPrevented: false },
      { key: 'Escape', surfaceKind: 'card' as const, popupOpen: false, defaultPrevented: true },
      { key: ' ', surfaceKind: 'card' as const, popupOpen: false, defaultPrevented: false },
    ]) {
      expect(keydownAction(input)).toBe('ignore');
    }
  });

  it('prunes, appends, and brings only live ids forward', () => {
    expect(reconcileStack(['summary', 'dock'], ['dock'])).toEqual(['dock']);
    expect(reconcileStack(['dock'], ['dock', 'summary'])).toEqual([
      'dock',
      'summary',
    ]);
    expect(bringToFront(['dock', 'summary'], 'dock')).toEqual(['summary', 'dock']);
    expect(topmost(['summary', 'dock'])).toBe('dock');
    expect(topmost([])).toBeNull();
  });
});

describe('map window geometry', () => {
  it('recovers a fully on-screen float after restore and viewport shrink', () => {
    const offscreen = { x: 900, y: 800, width: 400, height: 300 };
    expect(clampRect(offscreen, { width: 800, height: 600 })).toEqual({
      x: 400,
      y: 300,
      width: 400,
      height: 300,
    });
    expect(
      clampRect({ x: -900, y: -50, width: 400, height: 300 }, { width: 800, height: 600 }),
    ).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    expect(
      clampRect({ x: 10, y: 10, width: 2000, height: 1500 }, { width: 800, height: 600 }),
    ).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('applies drag and free resize deltas with a usable minimum', () => {
    const rect = { x: 10, y: 20, width: 380, height: 520 };
    expect(dragRect(rect, { x: 5, y: -3 })).toEqual({
      x: 15,
      y: 17,
      width: 380,
      height: 520,
    });
    expect(resizeRect(rect, { x: -500, y: -500 })).toEqual({
      x: 10,
      y: 20,
      width: 300,
      height: 220,
    });
  });
});
