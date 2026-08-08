/** Where and how one map window renders; the primitive never decides placement. */
export type WindowPlacement =
  | { readonly kind: 'docked' }
  | { readonly kind: 'docked-bottom-left' }
  | { readonly kind: 'node-anchored'; readonly systemId: number }
  | {
      readonly kind: 'edge-anchored';
      readonly fromSystemId: number;
      readonly toSystemId: number;
    };

/** The two stable identities in the window stack. */
export type MapWindowId = 'dock' | 'summary';

/** Inputs to the pure surface-presence derivation. */
export interface SurfaceInputs {
  readonly rootSystemId: number | null;
  readonly selectedIds: readonly number[];
  readonly boxSelectActive: boolean;
}

/** One live surface set derived from selection and root presence. */
export interface SurfaceDerivation {
  readonly surfaces: readonly MapWindowId[];
  readonly summarySystemId: number | null;
}

/**
 * Pure presence decisions for map windows. The current-system dock is
 * persistent whenever a root exists; only the node-summary card comes and goes.
 */
export function deriveSurfaces(input: SurfaceInputs): SurfaceDerivation {
  const surfaces: MapWindowId[] = [];
  let summarySystemId: number | null = null;
  if (input.rootSystemId !== null) surfaces.push('dock');
  if (
    !input.boxSelectActive &&
    input.selectedIds.length === 1 &&
    input.selectedIds[0] !== input.rootSystemId
  ) {
    summarySystemId = input.selectedIds[0] ?? null;
    if (summarySystemId !== null) surfaces.push('summary');
  }

  return { surfaces, summarySystemId };
}

/** The two semantic surface kinds used by keyboard arbitration. */
export type WindowSurfaceKind = 'dock' | 'card';

/** Escape surface kind implied by a placement — only anchored cards dismiss. */
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
