/** The internal React Flow node fields the isolated follower is allowed to read. */
export interface FollowerNode {
  readonly measured: {
    readonly width?: number;
    readonly height?: number;
  };
  readonly internals: {
    readonly positionAbsolute: { readonly x: number; readonly y: number };
  };
}

/** The narrow installed-store shape kept private to the mapper window follower. */
export interface FollowerState {
  readonly domNode: HTMLElement | null;
  readonly transform: readonly [number, number, number];
  readonly nodeLookup: ReadonlyMap<string, FollowerNode>;
}

/** Imperative store access used to avoid a React render for every pan or glide frame. */
export interface NodeFollowerStore {
  readonly getState: () => FollowerState;
  readonly subscribe: (
    listener: (state: FollowerState, previous: FollowerState) => void,
  ) => () => void;
}

interface FollowerBaseline {
  readonly anchorId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly tx: number;
  readonly ty: number;
  readonly zoom: number;
}

/** One follower decision; `null` means leave the DOM untouched. */
export interface FollowerDecision {
  readonly transform: string;
  readonly baseline: FollowerBaseline;
}

/**
 * Decides the node-anchored card transform from one installed-store snapshot.
 * A new anchor always writes once; unchanged facts write nothing.
 */
export function computeFollowerTransform(
  baseline: FollowerBaseline | null,
  anchorId: string,
  viewport: readonly [number, number, number],
  anchor: FollowerNode | undefined,
  measured: boolean,
): FollowerDecision | null {
  const width = anchor?.measured.width;
  const height = anchor?.measured.height;
  if (!measured || anchor === undefined || width === undefined || height === undefined) {
    return null;
  }

  const [tx, ty, zoom] = viewport;
  const next: FollowerBaseline = {
    anchorId,
    x: anchor.internals.positionAbsolute.x,
    y: anchor.internals.positionAbsolute.y,
    width,
    height,
    tx,
    ty,
    zoom,
  };
  if (
    baseline !== null &&
    baseline.anchorId === next.anchorId &&
    baseline.x === next.x &&
    baseline.y === next.y &&
    baseline.width === next.width &&
    baseline.height === next.height &&
    baseline.tx === next.tx &&
    baseline.ty === next.ty &&
    baseline.zoom === next.zoom
  ) {
    return null;
  }

  const left = tx + (next.x + width) * zoom + 12;
  const top = ty + next.y * zoom;
  return {
    transform: `translate(${left}px, ${top}px)`,
    baseline: next,
  };
}

interface FollowerScheduler {
  readonly schedule: (callback: () => void) => number;
  readonly cancel: (handle: number) => void;
}

const BROWSER_SCHEDULER: FollowerScheduler = {
  schedule: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/**
 * Applies a moving node's screen transform through CSSOM without subscribing React to hot state.
 * The returned disposer is idempotent and cancels both the store listener and queued frame.
 */
export function createNodeFollower(
  store: NodeFollowerStore,
  anchorId: string,
  write: (transform: string) => void,
  scheduler: FollowerScheduler = BROWSER_SCHEDULER,
): () => void {
  let baseline: FollowerBaseline | null = null;
  let frame: number | null = null;
  let latest = store.getState();
  let disposed = false;

  const evaluate = (state: FollowerState) => {
    if (state.domNode === null) return;
    const anchor = state.nodeLookup.get(anchorId);
    const decision = computeFollowerTransform(
      baseline,
      anchorId,
      state.transform,
      anchor,
      anchor !== undefined,
    );
    if (decision === null) return;
    baseline = decision.baseline;
    write(decision.transform);
  };

  // Arm synchronously so the card cannot paint at the layer origin.
  evaluate(latest);

  const unsubscribe = store.subscribe((state) => {
    latest = state;
    if (frame !== null) return;
    frame = scheduler.schedule(() => {
      frame = null;
      if (!disposed) evaluate(latest);
    });
  });

  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    if (frame !== null) scheduler.cancel(frame);
    frame = null;
  };
}

interface EdgeFollowerBaseline {
  readonly fromId: string;
  readonly toId: string;
  readonly midX: number;
  readonly midY: number;
  readonly tx: number;
  readonly ty: number;
  readonly zoom: number;
}

/** One edge-follower decision; `null` means leave the DOM untouched. */
export interface EdgeFollowerDecision {
  readonly transform: string;
  readonly baseline: EdgeFollowerBaseline;
}

/**
 * Disc center in flow coordinates, or `null` before the node is measured.
 * Matches `edge-geometry` disc-center policy so the card rides the drawn link.
 */
function discCenter(
  node: FollowerNode | undefined,
  radius: number,
): { readonly x: number; readonly y: number } | null {
  const width = node?.measured.width;
  if (node === undefined || width === undefined) return null;
  return {
    x: node.internals.positionAbsolute.x + width / 2,
    y: node.internals.positionAbsolute.y + radius,
  };
}

/**
 * Decides the edge-midpoint card transform from one installed-store snapshot.
 * A new endpoint pair always writes once; unchanged facts write nothing.
 */
export function computeEdgeFollowerTransform(
  baseline: EdgeFollowerBaseline | null,
  fromId: string,
  toId: string,
  viewport: readonly [number, number, number],
  from: FollowerNode | undefined,
  to: FollowerNode | undefined,
  radius: number,
): EdgeFollowerDecision | null {
  const fromCenter = discCenter(from, radius);
  const toCenter = discCenter(to, radius);
  if (fromCenter === null || toCenter === null) return null;

  const [tx, ty, zoom] = viewport;
  const midX = (fromCenter.x + toCenter.x) / 2;
  const midY = (fromCenter.y + toCenter.y) / 2;
  const next: EdgeFollowerBaseline = {
    fromId,
    toId,
    midX,
    midY,
    tx,
    ty,
    zoom,
  };
  if (
    baseline !== null &&
    baseline.fromId === next.fromId &&
    baseline.toId === next.toId &&
    baseline.midX === next.midX &&
    baseline.midY === next.midY &&
    baseline.tx === next.tx &&
    baseline.ty === next.ty &&
    baseline.zoom === next.zoom
  ) {
    return null;
  }

  // Center the card on the midpoint with a small upward offset so it sits
  // above the line rather than covering the link stroke.
  const left = tx + midX * zoom;
  const top = ty + midY * zoom - 8;
  return {
    transform: `translate(calc(${left}px - 50%), calc(${top}px - 100%))`,
    baseline: next,
  };
}

/**
 * Applies a moving edge's midpoint transform through CSSOM without React hot-state subscriptions.
 * The returned disposer is idempotent and cancels both the store listener and queued frame.
 */
export function createEdgeFollower(
  store: NodeFollowerStore,
  fromId: string,
  toId: string,
  radius: number,
  write: (transform: string) => void,
  scheduler: FollowerScheduler = BROWSER_SCHEDULER,
): () => void {
  let baseline: EdgeFollowerBaseline | null = null;
  let frame: number | null = null;
  let latest = store.getState();
  let disposed = false;

  const evaluate = (state: FollowerState) => {
    if (state.domNode === null) return;
    const decision = computeEdgeFollowerTransform(
      baseline,
      fromId,
      toId,
      state.transform,
      state.nodeLookup.get(fromId),
      state.nodeLookup.get(toId),
      radius,
    );
    if (decision === null) return;
    baseline = decision.baseline;
    write(decision.transform);
  };

  evaluate(latest);

  const unsubscribe = store.subscribe((state) => {
    latest = state;
    if (frame !== null) return;
    frame = scheduler.schedule(() => {
      frame = null;
      if (!disposed) evaluate(latest);
    });
  });

  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    if (frame !== null) scheduler.cancel(frame);
    frame = null;
  };
}
