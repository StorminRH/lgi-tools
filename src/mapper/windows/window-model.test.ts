import { describe, expect, it } from 'vitest';
import {
  bringToFront,
  deriveSurfaces,
  keydownAction,
  isOutsideClickGesture,
  outsideDismissAction,
  persistentWindowSystemId,
  reconcileStack,
  surfaceKindOf,
  topmost,
} from './window-model';

const base = {
  dockSystemId: 1,
  selectedIds: [] as number[],
  boxSelectActive: false,
};

describe('map window presence', () => {
  it('points persistent windows at the ready tracked system and falls back otherwise', () => {
    expect(
      persistentWindowSystemId({ kind: 'ready', systemId: 31_000_001 }, 1),
    ).toBe(31_000_001);
    expect(persistentWindowSystemId({ kind: 'none' }, 1)).toBe(1);
    expect(persistentWindowSystemId({ kind: 'loading' }, 1)).toBe(1);
    expect(persistentWindowSystemId({ kind: 'ambiguous' }, 1)).toBe(1);
    expect(persistentWindowSystemId({ kind: 'none' }, null)).toBeNull();
  });

  it('keeps the current-system dock standing and shows a card only for one settled non-dock selection', () => {
    expect(deriveSurfaces(base).surfaces).toEqual(['dock']);
    expect(deriveSurfaces({ ...base, selectedIds: [1] }).surfaces).toEqual(['dock']);
    expect(deriveSurfaces({ ...base, dockSystemId: null }).surfaces).toEqual([]);

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
    expect(
      deriveSurfaces({ ...base, dockSystemId: 2, selectedIds: [1] }),
    ).toMatchObject({
      surfaces: ['dock', 'summary'],
      summarySystemId: 1,
    });
    expect(
      deriveSurfaces({ ...base, dockSystemId: 2, selectedIds: [2] }),
    ).toMatchObject({ surfaces: ['dock'], summarySystemId: null });
  });
});

describe('map window keyboard and stack', () => {
  it('derives Escape kinds, dismisses owned outside clicks, and reconciles the live stack', () => {
    expect(surfaceKindOf({ kind: 'docked' })).toBe('dock');
    expect(surfaceKindOf({ kind: 'docked-bottom-left' })).toBe('dock');
    expect(surfaceKindOf({ kind: 'node-anchored', systemId: 2 })).toBe('card');
    expect(surfaceKindOf({ kind: 'scanner-anchored' })).toBe('card');

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
