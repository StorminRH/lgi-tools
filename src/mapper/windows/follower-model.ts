import { endpointFrame, frameCenter } from '../canvas/edge-geometry';

/** The internal React Flow node fields the isolated follower is allowed to read. */
export interface FollowerNode {
  readonly measured: {
    readonly width?: number;
    readonly height?: number;
  };
  readonly internals: {
    readonly positionAbsolute: { readonly x: number; readonly y: number };
  };
  /** v12 declared frame dimensions — present from first render for chain nodes. */
  readonly width?: number;
  readonly height?: number;
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
export const CARD_ANCHOR_GAP = 40;

/** Which horizontal half of the anchor the card prefers to occupy. */
export type CardAnchorSide = 'left' | 'right';

/** Minimum rim-to-anchor distance before a leader line is drawn. */
export const LEADER_MIN_DISTANCE = 12;

/** Fallback size matching the node-anchored `w-72 h-52` chrome before layout. */
export const NODE_CARD_FALLBACK: ScreenSize = { width: 288, height: 208 };

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
  side: CardAnchorSide | null,
): { readonly write: FollowerWrite; readonly side: CardAnchorSide } {
  const placement = placeAnchoredCard({
    anchor: screenAnchor,
    card,
    viewport: layer,
    side,
  });
  return {
    write: {
      transform: `translate(${placement.left}px, ${placement.top}px)`,
      leader: placement.leader,
    },
    side: placement.side,
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
 * horizontal half on first placement, then keep that side sticky so camera
 * pans push the card against the viewport instead of flipping it. Vertically
 * center on the anchor, then inset-clamp so the card stays readable.
 */
export function placeAnchoredCard(input: {
  readonly anchor: ScreenPoint;
  readonly card: ScreenSize;
  readonly viewport: ScreenSize;
  readonly gap?: number;
  readonly padding?: number;
  readonly leaderMinDistance?: number;
  /** Sticky side from a prior frame; omit to choose from the midline. */
  readonly side?: CardAnchorSide | null;
}): {
  readonly left: number;
  readonly top: number;
  readonly leader: LeaderSegment | null;
  readonly side: CardAnchorSide;
} {
  const gap = input.gap ?? CARD_ANCHOR_GAP;
  const padding = input.padding ?? CARD_VIEWPORT_PADDING;
  const leaderMin = input.leaderMinDistance ?? LEADER_MIN_DISTANCE;
  const { anchor, card, viewport } = input;

  const side: CardAnchorSide =
    input.side ?? (anchor.x >= viewport.width / 2 ? 'left' : 'right');
  const preferLeft = side === 'left';
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

  return { left, top, leader, side };
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
  readonly side: CardAnchorSide;
}

/** One follower decision; `null` means leave the DOM untouched. */
export interface FollowerDecision {
  readonly write: FollowerWrite;
  readonly baseline: FollowerBaseline;
}

/**
 * Decides the node-anchored card transform from one installed-store snapshot.
 * A new anchor always writes once; unchanged facts write nothing. Anchor
 * center flows through `endpointFrame` / `frameCenter` — the same frame
 * owner edges and cameras use (declared dims cover the pre-measure window).
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
  if (!measured || anchor === undefined) return null;
  const frame = endpointFrame(anchor);
  if (frame === null) return null;
  const center = frameCenter(frame);

  const [tx, ty, zoom] = viewport;
  const placed = anchoredFollowerWrite(
    {
      x: tx + center.x * zoom,
      y: ty + center.y * zoom,
    },
    card,
    layer,
    // Retargeting a new node picks a fresh side; same node keeps sticky side.
    baseline !== null && baseline.anchorId === anchorId ? baseline.side : null,
  );
  const next: FollowerBaseline = {
    anchorId,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    tx,
    ty,
    zoom,
    cardWidth: card.width,
    cardHeight: card.height,
    layerWidth: layer.width,
    layerHeight: layer.height,
    side: placed.side,
  };
  if (
    baseline !== null &&
    baseline.anchorId === next.anchorId &&
    baseline.x === next.x &&
    baseline.y === next.y &&
    baseline.width === next.width &&
    baseline.height === next.height &&
    baseline.side === next.side &&
    sameSharedFollowerFrame(baseline, next)
  ) {
    return null;
  }

  return {
    write: placed.write,
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
 * The shared arming loop node and edge followers ride: evaluate a per-frame
 * decision against the latest baseline, and write only when a decision lands.
 */
function createDecidedFollower<Baseline>(
  store: NodeFollowerStore,
  card: HTMLElement,
  fallback: ScreenSize,
  decide: (
    state: FollowerState,
    baseline: Baseline | null,
    card: ScreenSize,
    layer: ScreenSize,
  ) => { readonly write: FollowerWrite; readonly baseline: Baseline } | null,
  write: (payload: FollowerWrite) => void,
  scheduler: FollowerScheduler,
  observeSize: SizeObserver,
): () => void {
  let baseline: Baseline | null = null;
  return armSizedFollower(
    store,
    card,
    (state) => {
      if (state.domNode === null) return;
      const decision = decide(
        state,
        baseline,
        measureCardSize(card, fallback),
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
  return createDecidedFollower<FollowerBaseline>(
    store,
    card,
    NODE_CARD_FALLBACK,
    (state, baseline, cardSize, layer) => {
      const anchor = state.nodeLookup.get(anchorId);
      return computeFollowerTransform(
        baseline,
        anchorId,
        state.transform,
        anchor,
        anchor !== undefined,
        cardSize,
        layer,
      );
    },
    write,
    scheduler,
    observeSize,
  );
}

