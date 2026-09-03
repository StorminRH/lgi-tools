import type { TrackedSystemTarget } from '../tracking/tracked-system';

export type ScannerAnchoredMeasure = 'editor' | 'site';

export type WindowPlacement =
  | { readonly kind: 'docked' }
  | { readonly kind: 'docked-bottom-left' }
  | {
      readonly kind: 'scanner-anchored';
      readonly measure?: ScannerAnchoredMeasure;
    }
  | { readonly kind: 'node-anchored'; readonly systemId: number };

export type MapWindowId = 'dock' | 'summary';

export interface SurfaceInputs {
  readonly dockSystemId: number | null;
  readonly selectedIds: readonly number[];
  readonly boxSelectActive: boolean;
}

export interface SurfaceDerivation {
  readonly surfaces: readonly MapWindowId[];
  readonly summarySystemId: number | null;
}

export function persistentWindowSystemId(
  target: TrackedSystemTarget,
  rootSystemId: number | null,
): number | null {
  return target.kind === 'ready' ? target.systemId : rootSystemId;
}

export function deriveSurfaces(input: SurfaceInputs): SurfaceDerivation {
  const surfaces: MapWindowId[] = [];
  let summarySystemId: number | null = null;
  if (input.dockSystemId !== null) surfaces.push('dock');
  if (
    !input.boxSelectActive &&
    input.selectedIds.length === 1 &&
    input.selectedIds[0] !== input.dockSystemId
  ) {
    summarySystemId = input.selectedIds[0] ?? null;
    if (summarySystemId !== null) surfaces.push('summary');
  }

  return { surfaces, summarySystemId };
}

export type WindowSurfaceKind = 'dock' | 'card';

export function surfaceKindOf(placement: WindowPlacement): WindowSurfaceKind {
  return placement.kind === 'node-anchored' || placement.kind === 'scanner-anchored'
    ? 'card'
    : 'dock';
}

export type WindowKeydownAction = 'dismiss-card' | 'ignore';

export function keydownAction(input: {
  readonly key: string;
  readonly surfaceKind: WindowSurfaceKind;
  readonly popupOpen: boolean;
  readonly defaultPrevented: boolean;
}): WindowKeydownAction {
  if (
    input.key === 'Escape' &&
    input.surfaceKind === 'card' &&
    !input.popupOpen &&
    !input.defaultPrevented
  ) {
    return 'dismiss-card';
  }
  return 'ignore';
}

const OUTSIDE_CLICK_SLOP_PX = 4;

export function isOutsideClickGesture(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
  slopPx: number = OUTSIDE_CLICK_SLOP_PX,
): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return dx * dx + dy * dy <= slopPx * slopPx;
}

export function outsideDismissAction(input: {
  readonly insideCard: boolean;
  readonly insideOpenPopup: boolean;
  readonly popupOpen: boolean;
  readonly isClick: boolean;
}): WindowKeydownAction {
  if (
    !input.isClick ||
    input.popupOpen ||
    input.insideCard ||
    input.insideOpenPopup
  ) {
    return 'ignore';
  }
  return 'dismiss-card';
}

export function reconcileStack(
  stack: readonly MapWindowId[],
  liveIds: readonly MapWindowId[],
): readonly MapWindowId[] {
  const live = new Set(liveIds);
  const next = stack.filter((id) => live.has(id));
  for (const id of liveIds) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}

export function bringToFront(
  stack: readonly MapWindowId[],
  id: MapWindowId,
): readonly MapWindowId[] {
  if (!stack.includes(id)) return stack;
  return [...stack.filter((candidate) => candidate !== id), id];
}

export function topmost(stack: readonly MapWindowId[]): MapWindowId | null {
  return stack.at(-1) ?? null;
}
