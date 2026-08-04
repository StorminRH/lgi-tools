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

/** Screen/layer pixel size. */
export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

/** Screen/layer pixel point. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** One leader segment from the card rim to the map anchor. */
export interface LeaderSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** What one follower frame writes through CSSOM. */
export interface FollowerWrite {
  readonly transform: string;
  readonly leader: LeaderSegment | null;
}

/** Inset from the viewport edge so cards never kiss the chrome. */
export const CARD_VIEWPORT_PADDING = 16;

/** Preferred gap between the anchor and the near card edge. */
export const CARD_ANCHOR_GAP = 20;

/** Minimum rim-to-anchor distance before a leader line is drawn. */
export const LEADER_MIN_DISTANCE = 12;

/** Fallback size matching the node-anchored `w-72 h-52` chrome before layout. */
export const NODE_CARD_FALLBACK: ScreenSize = { width: 288, height: 208 };

/** Fallback size matching the edge-anchored `w-72` chrome before layout. */
export const EDGE_CARD_FALLBACK: ScreenSize = { width: 288, height: 320 };

/** Fallback layer size when the React Flow host is absent or unmeasured. */
export const LAYER_SIZE_FALLBACK: ScreenSize = { width: 1440, height: 900 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Camera + measured card/layer frame shared by node and edge followers. */
interface SharedFollowerFrame {
  readonly tx: number;
  readonly ty: number;
  readonly zoom: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly layerWidth: number;
  readonly layerHeight: number;
}

function sameSharedFollowerFrame(
  a: SharedFollowerFrame,
  b: SharedFollowerFrame,
): boolean {
  return (
    a.tx === b.tx &&
    a.ty === b.ty &&
    a.zoom === b.zoom &&
    a.cardWidth === b.cardWidth &&
    a.cardHeight === b.cardHeight &&
    a.layerWidth === b.layerWidth &&
    a.layerHeight === b.layerHeight
  );
}

function anchoredFollowerWrite(
  screenAnchor: ScreenPoint,
  card: ScreenSize,
  layer: ScreenSize,
): FollowerWrite {
  const placement = placeAnchoredCard({
    anchor: screenAnchor,
    card,
    viewport: layer,
  });
  return {
    transform: `translate(${placement.left}px, ${placement.top}px)`,
    leader: placement.leader,
  };
}

/** Nearest point on the card rectangle to the anchor (for the leader root). */
export function nearestCardPoint(
  left: number,
  top: number,
  card: ScreenSize,
  anchor: ScreenPoint,
): ScreenPoint {
  return {
    x: clamp(anchor.x, left, left + card.width),
    y: clamp(anchor.y, top, top + card.height),
  };
}

/**
 * Places a card near an anchor in screen/layer space: prefer the open
 * horizontal half, vertically center on the anchor, then inset-clamp so the
 * card stays readable inside the viewport (never flush to the edge).
 */
export function placeAnchoredCard(input: {
  readonly anchor: ScreenPoint;
  readonly card: ScreenSize;
  readonly viewport: ScreenSize;
  readonly gap?: number;
  readonly padding?: number;
  readonly leaderMinDistance?: number;
}): {
  readonly left: number;
  readonly top: number;
  readonly leader: LeaderSegment | null;
} {
  const gap = input.gap ?? CARD_ANCHOR_GAP;
  const padding = input.padding ?? CARD_VIEWPORT_PADDING;
  const leaderMin = input.leaderMinDistance ?? LEADER_MIN_DISTANCE;
  const { anchor, card, viewport } = input;

  const preferLeft = anchor.x >= viewport.width / 2;
  let left = preferLeft ? anchor.x - gap - card.width : anchor.x + gap;
  let top = anchor.y - card.height / 2;

  const maxLeft = Math.max(padding, viewport.width - card.width - padding);
  const maxTop = Math.max(padding, viewport.height - card.height - padding);
  left = clamp(left, padding, maxLeft);
  top = clamp(top, padding, maxTop);

  const from = nearestCardPoint(left, top, card, anchor);
  const distance = Math.hypot(from.x - anchor.x, from.y - anchor.y);
  const leader =
    distance >= leaderMin
      ? { x1: from.x, y1: from.y, x2: anchor.x, y2: anchor.y }
      : null;

  return { left, top, leader };
}

/** Measured card size, or the fallback when the element has not laid out yet. */
export function measureCardSize(
  element: HTMLElement,
  fallback: ScreenSize,
): ScreenSize {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  if (width <= 0 || height <= 0) return fallback;
  return { width, height };
}

/** Layer size from the React Flow host, with a safe fallback. */
export function measureLayerSize(domNode: HTMLElement | null): ScreenSize {
  if (domNode === null) return LAYER_SIZE_FALLBACK;
  const width = domNode.clientWidth;
  const height = domNode.clientHeight;
  if (width <= 0 || height <= 0) return LAYER_SIZE_FALLBACK;
  return { width, height };
}

/** Applies one follower frame to the card and optional leader line. */
export function applyFollowerWrite(
  card: HTMLElement,
  leaderLine: SVGLineElement | null,
  leaderToken: SVGCircleElement | null,
  payload: FollowerWrite,
): void {
  card.style.setProperty('--map-window-transform', payload.transform);
  if (leaderLine === null) return;
  if (payload.leader === null) {
    leaderLine.setAttribute('visibility', 'hidden');
    leaderToken?.setAttribute('visibility', 'hidden');
    return;
  }
  leaderLine.setAttribute('x1', String(payload.leader.x1));
  leaderLine.setAttribute('y1', String(payload.leader.y1));
  leaderLine.setAttribute('x2', String(payload.leader.x2));
  leaderLine.setAttribute('y2', String(payload.leader.y2));
  leaderLine.setAttribute('visibility', 'visible');
  if (leaderToken !== null) {
    leaderToken.setAttribute('cx', String(payload.leader.x2));
    leaderToken.setAttribute('cy', String(payload.leader.y2));
    leaderToken.setAttribute('visibility', 'visible');
  }
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
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly layerWidth: number;
  readonly layerHeight: number;
}

/** One follower decision; `null` means leave the DOM untouched. */
export interface FollowerDecision {
  readonly write: FollowerWrite;
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
  card: ScreenSize,
  layer: ScreenSize,
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
    cardWidth: card.width,
    cardHeight: card.height,
    layerWidth: layer.width,
    layerHeight: layer.height,
  };
  if (
    baseline !== null &&
    baseline.anchorId === next.anchorId &&
    baseline.x === next.x &&
    baseline.y === next.y &&
    baseline.width === next.width &&
    baseline.height === next.height &&
    sameSharedFollowerFrame(baseline, next)
  ) {
    return null;
  }

  return {
    write: anchoredFollowerWrite(
      {
        x: tx + (next.x + width / 2) * zoom,
        y: ty + (next.y + height / 2) * zoom,
      },
      card,
      layer,
    ),
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
 * Observes box changes on one element. Injected in tests so a card/layer
 * resize can force a rewrite without a real ResizeObserver.
 */
export type SizeObserver = (
  element: HTMLElement,
  onSize: () => void,
) => () => void;

const BROWSER_SIZE_OBSERVER: SizeObserver = (element, onSize) => {
  if (typeof ResizeObserver === 'undefined') return () => undefined;
  const observer = new ResizeObserver(() => onSize());
  observer.observe(element);
  return () => observer.disconnect();
};

/**
 * Shared rAF-coalesced store subscription for node and edge followers.
 * Arms synchronously so the card cannot paint at the layer origin.
 */
function armFollower(
  store: NodeFollowerStore,
  evaluate: (state: FollowerState) => void,
  scheduler: FollowerScheduler,
): () => void {
  let frame: number | null = null;
  let latest = store.getState();
  let disposed = false;

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

/**
 * Store subscription plus card/layer size observation. Async card growth
 * (codex panel, restore copy) must reclamp without waiting for a pan.
 */
function armSizedFollower(
  store: NodeFollowerStore,
  card: HTMLElement,
  evaluate: (state: FollowerState) => void,
  scheduler: FollowerScheduler,
  observeSize: SizeObserver,
): () => void {
  let layerObserved: HTMLElement | null = null;
  let stopLayerObserve: (() => void) | null = null;

  const run = () => {
    evaluate(store.getState());
  };

  const disposeArm = armFollower(
    store,
    (state) => {
      if (state.domNode !== null && state.domNode !== layerObserved) {
        stopLayerObserve?.();
        layerObserved = state.domNode;
        stopLayerObserve = observeSize(state.domNode, run);
      }
      evaluate(state);
    },
    scheduler,
  );
  const stopCardObserve = observeSize(card, run);

  return () => {
    disposeArm();
    stopCardObserve();
    stopLayerObserve?.();
  };
}

/**
 * Applies a moving node's screen transform through CSSOM without subscribing React to hot state.
 * The returned disposer is idempotent and cancels both the store listener and queued frame.
 */
export function createNodeFollower(
  store: NodeFollowerStore,
  anchorId: string,
  card: HTMLElement,
  write: (payload: FollowerWrite) => void,
  scheduler: FollowerScheduler = BROWSER_SCHEDULER,
  observeSize: SizeObserver = BROWSER_SIZE_OBSERVER,
): () => void {
  let baseline: FollowerBaseline | null = null;
  return armSizedFollower(
    store,
    card,
    (state) => {
      if (state.domNode === null) return;
      const anchor = state.nodeLookup.get(anchorId);
      const decision = computeFollowerTransform(
        baseline,
        anchorId,
        state.transform,
        anchor,
        anchor !== undefined,
        measureCardSize(card, NODE_CARD_FALLBACK),
        measureLayerSize(state.domNode),
      );
      if (decision === null) return;
      baseline = decision.baseline;
      write(decision.write);
    },
    scheduler,
    observeSize,
  );
}

interface EdgeFollowerBaseline {
  readonly fromId: string;
  readonly toId: string;
  readonly midX: number;
  readonly midY: number;
  readonly tx: number;
  readonly ty: number;
  readonly zoom: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly layerWidth: number;
  readonly layerHeight: number;
}

/** One edge-follower decision; `null` means leave the DOM untouched. */
export interface EdgeFollowerDecision {
  readonly write: FollowerWrite;
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
  card: ScreenSize,
  layer: ScreenSize,
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
    cardWidth: card.width,
    cardHeight: card.height,
    layerWidth: layer.width,
    layerHeight: layer.height,
  };
  if (
    baseline !== null &&
    baseline.fromId === next.fromId &&
    baseline.toId === next.toId &&
    baseline.midX === next.midX &&
    baseline.midY === next.midY &&
    sameSharedFollowerFrame(baseline, next)
  ) {
    return null;
  }

  return {
    write: anchoredFollowerWrite(
      { x: tx + midX * zoom, y: ty + midY * zoom },
      card,
      layer,
    ),
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
  card: HTMLElement,
  write: (payload: FollowerWrite) => void,
  scheduler: FollowerScheduler = BROWSER_SCHEDULER,
  observeSize: SizeObserver = BROWSER_SIZE_OBSERVER,
): () => void {
  let baseline: EdgeFollowerBaseline | null = null;
  return armSizedFollower(
    store,
    card,
    (state) => {
      if (state.domNode === null) return;
      const decision = computeEdgeFollowerTransform(
        baseline,
        fromId,
        toId,
        state.transform,
        state.nodeLookup.get(fromId),
        state.nodeLookup.get(toId),
        radius,
        measureCardSize(card, EDGE_CARD_FALLBACK),
        measureLayerSize(state.domNode),
      );
      if (decision === null) return;
      baseline = decision.baseline;
      write(decision.write);
    },
    scheduler,
    observeSize,
  );
}
