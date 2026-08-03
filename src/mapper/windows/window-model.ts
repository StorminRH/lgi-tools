/** Where and how one map window renders; the primitive never decides placement. */
export type WindowPlacement =
  | { readonly kind: 'docked' }
  | { readonly kind: 'floating'; readonly rect: WindowRect }
  | { readonly kind: 'node-anchored'; readonly systemId: number };

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
export type DockMode = 'docked' | 'floating';

/** One unconditional node click, including clicks on an already-selected node. */
export interface RootClickSignal {
  readonly systemId: number;
  readonly token: number;
}

/** Inputs to the pure surface-presence derivation. */
export interface SurfaceInputs {
  readonly rootSystemId: number | null;
  readonly dockHidden: boolean;
  readonly mode: DockMode;
  readonly selectedIds: readonly number[];
  readonly boxSelectActive: boolean;
  readonly rootClick: RootClickSignal | null;
  readonly consumedRootClickToken: number;
}

/** One live surface and the state transitions consumed while deriving it. */
export interface SurfaceDerivation {
  readonly surfaces: readonly MapWindowId[];
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
  if (input.rootSystemId !== null && !dockHidden) surfaces.push('dock');
  if (
    !input.boxSelectActive &&
    input.selectedIds.length === 1 &&
    input.selectedIds[0] !== input.rootSystemId
  ) {
    surfaces.push('summary');
  }

  return { surfaces, dockHidden, consumedRootClickToken };
}

/** The two semantic surface kinds used by keyboard arbitration. */
export type WindowSurfaceKind = 'dock' | 'card';

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

/** Keeps a floating title bar reachable without quantizing the user's rectangle. */
export function clampRect(
  rect: WindowRect,
  viewport: WindowViewport,
  minVisible = 48,
): WindowRect {
  const maxX = Math.max(minVisible - rect.width, viewport.width - minVisible);
  const maxY = Math.max(0, viewport.height - minVisible);
  return {
    ...rect,
    x: Math.min(maxX, Math.max(minVisible - rect.width, rect.x)),
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
  minimum = { width: 300, height: 220 },
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
