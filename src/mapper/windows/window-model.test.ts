import { describe, expect, it } from 'vitest';
import {
  bringToFront,
  deriveSurfaces,
  keydownAction,
  isOutsideClickGesture,
  outsideDismissAction,
  reconcileStack,
  surfaceKindOf,
  topmost,
} from './window-model';

const base = {
  rootSystemId: 1,
  selectedIds: [] as number[],
  boxSelectActive: false,
};

describe('map window presence', () => {
  it('keeps the root dock standing and shows a card only for one settled non-root selection', () => {
    expect(deriveSurfaces(base).surfaces).toEqual(['dock']);
    expect(deriveSurfaces({ ...base, selectedIds: [1] }).surfaces).toEqual(['dock']);
    expect(deriveSurfaces({ ...base, rootSystemId: null }).surfaces).toEqual([]);

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
  it('derives Escape kinds, dismisses owned outside clicks, and reconciles the live stack', () => {
    expect(surfaceKindOf({ kind: 'docked' })).toBe('dock');
    expect(surfaceKindOf({ kind: 'docked-bottom-left' })).toBe('dock');
    expect(surfaceKindOf({ kind: 'node-anchored', systemId: 2 })).toBe('card');
    expect(
      surfaceKindOf({
        kind: 'edge-anchored',
        fromSystemId: 1,
        toSystemId: 2,
      }),
    ).toBe('card');

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

    expect(
      outsideDismissAction({
        insideCard: false,
        insideOpenPopup: false,
        popupOpen: false,
        isClick: true,
      }),
    ).toBe('dismiss-card');
    expect(
      outsideDismissAction({
        insideCard: false,
        insideOpenPopup: false,
        popupOpen: false,
        isClick: false,
      }),
    ).toBe('ignore');
    expect(
      outsideDismissAction({
        insideCard: true,
        insideOpenPopup: false,
        popupOpen: false,
        isClick: true,
      }),
    ).toBe('ignore');
    expect(
      outsideDismissAction({
        insideCard: false,
        insideOpenPopup: true,
        popupOpen: false,
        isClick: true,
      }),
    ).toBe('ignore');
    expect(
      outsideDismissAction({
        insideCard: false,
        insideOpenPopup: false,
        popupOpen: true,
        isClick: true,
      }),
    ).toBe('ignore');

    expect(
      isOutsideClickGesture({ x: 10, y: 10 }, { x: 12, y: 11 }),
    ).toBe(true);
    expect(
      isOutsideClickGesture({ x: 10, y: 10 }, { x: 20, y: 10 }),
    ).toBe(false);

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
