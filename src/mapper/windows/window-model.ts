/** Where and how one map window renders; the primitive never decides placement. */
export type WindowPlacement =
  | { readonly kind: 'docked' }
  | { readonly kind: 'floating'; readonly rect: WindowRect }
  | { readonly kind: 'node-anchored'; readonly systemId: number }
  | {
      readonly kind: 'edge-anchored';
      readonly fromSystemId: number;
      readonly toSystemId: number;
    };

/** One floating rectangle in map-layer pixels. */
export interface WindowRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The viewport dimensions used to recover reachable floating geometry. */
export interface WindowViewport {
  readonly width: number;
  readonly height: number;
}

/** The two stable identities in the window stack. */
export type MapWindowId = 'dock' | 'summary';

/** The only persisted dock presentation modes. */
export const DOCK_MODES = ['docked', 'floating'] as const;

/** The only persisted dock presentation modes. */
export type DockMode = (typeof DOCK_MODES)[number];

/** Usable floating minimum; resize and persistence validation share this floor. */
export const MIN_FLOATING_SIZE = { width: 300, height: 220 } as const;

/** One unconditional node click, including clicks on an already-selected node. */
export interface RootClickSignal {
  readonly systemId: number;
  readonly token: number;
}

/** Inputs to the pure surface-presence derivation. */
export interface SurfaceInputs {
  readonly rootSystemId: number | null;
  readonly dockHidden: boolean;
  readonly selectedIds: readonly number[];
  readonly boxSelectActive: boolean;
  readonly rootClick: RootClickSignal | null;
  readonly consumedRootClickToken: number;
}

/** One live surface and the state transitions consumed while deriving it. */
export interface SurfaceDerivation {
  readonly surfaces: readonly MapWindowId[];
  readonly summarySystemId: number | null;
  readonly dockHidden: boolean;
  readonly consumedRootClickToken: number;
}

/** Pure presence, stacking, keyboard, and geometry decisions for map windows. */
export function deriveSurfaces(input: SurfaceInputs): SurfaceDerivation {
  let dockHidden = input.dockHidden;
  let consumedRootClickToken = input.consumedRootClickToken;
  const click = input.rootClick;

  if (click !== null && click.token > consumedRootClickToken) {
    consumedRootClickToken = click.token;
    if (
      !input.boxSelectActive &&
      input.rootSystemId !== null &&
      click.systemId === input.rootSystemId
    ) {
      dockHidden = false;
    }
  }

  const surfaces: MapWindowId[] = [];
  let summarySystemId: number | null = null;
  if (input.rootSystemId !== null && !dockHidden) surfaces.push('dock');
  if (
    !input.boxSelectActive &&
    input.selectedIds.length === 1 &&
    input.selectedIds[0] !== input.rootSystemId
  ) {
    summarySystemId = input.selectedIds[0] ?? null;
    if (summarySystemId !== null) surfaces.push('summary');
  }

  return { surfaces, summarySystemId, dockHidden, consumedRootClickToken };
}

/** The two semantic surface kinds used by keyboard arbitration. */
export type WindowSurfaceKind = 'dock' | 'card';

/** Escape surface kind implied by a placement — docked/floating share dock rules. */
export function surfaceKindOf(placement: WindowPlacement): WindowSurfaceKind {
  return placement.kind === 'node-anchored' || placement.kind === 'edge-anchored'
    ? 'card'
    : 'dock';
}

/** The only action a map-window keydown may request. */
export type WindowKeydownAction = 'dismiss-card' | 'ignore';

/** Decides Escape ownership; callers always stop the in-window keydown afterward. */
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

/** Max movement (px) still treated as a click for outside-dismiss; pans stay open. */
export const OUTSIDE_CLICK_SLOP_PX = 4;

/**
 * Whether a pointer gesture stayed within the click slop (not a pan/drag).
 * Callers supply down/up client coordinates; this keeps the threshold pure.
 */
export function isOutsideClickGesture(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
  slopPx: number = OUTSIDE_CLICK_SLOP_PX,
): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return dx * dx + dy * dy <= slopPx * slopPx;
}

/**
 * Decides whether a pointer outside an anchored card should dismiss it.
 * Callers resolve DOM containment and click-vs-drag; this keeps the policy pure.
 */
export function outsideDismissAction(input: {
  readonly insideCard: boolean;
  readonly insideOpenPopup: boolean;
  readonly popupOpen: boolean;
  /** False when the gesture moved beyond {@link OUTSIDE_CLICK_SLOP_PX} (pan/drag). */
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

/** Reconciles the z-stack to the currently rendered surface set. */
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

/** Moves one live window to the top of its stack. */
export function bringToFront(
  stack: readonly MapWindowId[],
  id: MapWindowId,
): readonly MapWindowId[] {
  if (!stack.includes(id)) return stack;
  return [...stack.filter((candidate) => candidate !== id), id];
}

/** Returns the top live window, or `null` for an empty stack. */
export function topmost(stack: readonly MapWindowId[]): MapWindowId | null {
  return stack.at(-1) ?? null;
}

/** Keeps a floating window fully inside the viewport so title bar and grip stay hittable. */
export function clampRect(
  rect: WindowRect,
  viewport: WindowViewport,
): WindowRect {
  // Cap size first, then pin position into the remaining free space — a
  // viewport-sized float at a positive origin would otherwise leave the
  // bottom-right resize grip outside the map layer.
  const width = Math.min(
    Math.max(rect.width, MIN_FLOATING_SIZE.width),
    Math.max(MIN_FLOATING_SIZE.width, viewport.width),
  );
  const height = Math.min(
    Math.max(rect.height, MIN_FLOATING_SIZE.height),
    Math.max(MIN_FLOATING_SIZE.height, viewport.height),
  );
  const maxX = Math.max(0, viewport.width - width);
  const maxY = Math.max(0, viewport.height - height);
  return {
    width,
    height,
    x: Math.min(maxX, Math.max(0, rect.x)),
    y: Math.min(maxY, Math.max(0, rect.y)),
  };
}

/** Applies one incremental drag delta without changing size. */
export function dragRect(
  rect: WindowRect,
  delta: { readonly x: number; readonly y: number },
): WindowRect {
  return { ...rect, x: rect.x + delta.x, y: rect.y + delta.y };
}

/** Applies one incremental resize delta while keeping the usable minimum box. */
export function resizeRect(
  rect: WindowRect,
  delta: { readonly x: number; readonly y: number },
  minimum: { readonly width: number; readonly height: number } = MIN_FLOATING_SIZE,
): WindowRect {
  return {
    ...rect,
    width: Math.max(minimum.width, rect.width + delta.x),
    height: Math.max(minimum.height, rect.height + delta.y),
  };
}

/** Stable starting geometry used only when this device has no remembered float. */
export const DEFAULT_FLOATING_RECT: WindowRect = {
  x: 72,
  y: 88,
  width: 380,
  height: 520,
};
