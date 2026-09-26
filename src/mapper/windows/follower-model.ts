import { SYSTEM_DISC_SIZE } from '../canvas/SystemNode';
import { endpointFrame, frameCenter, pointOnRayAtRadius } from '../canvas/edge-geometry';
import { roundedLeaderPath } from './leader-path';

export interface FollowerNode {
  readonly measured: {
    readonly width?: number;
    readonly height?: number;
  };
  readonly internals: {
    readonly positionAbsolute: { readonly x: number; readonly y: number };
  };
  readonly width?: number;
  readonly height?: number;
}

export interface FollowerState {
  readonly domNode: HTMLElement | null;
  readonly transform: readonly [number, number, number];
  readonly nodeLookup: ReadonlyMap<string, FollowerNode>;
}

export interface NodeFollowerStore {
  readonly getState: () => FollowerState;
  readonly subscribe: (
    listener: (state: FollowerState, previous: FollowerState) => void,
  ) => () => void;
}

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface AnchoredLeader {
  /** Rounded path from the disc rim to the card edge, drawn in that order. */
  readonly d: string;
  readonly start: ScreenPoint;
  readonly end: ScreenPoint;
}

export interface FollowerWrite {
  readonly transform: string;
  readonly side: CardAnchorSide;
  readonly leader: AnchoredLeader | null;
}

const CARD_VIEWPORT_PADDING = 16;

/** Horizontal clearance between the disc rim and the card's near edge. */
export const CARD_ANCHOR_GAP = 44;

/**
 * Minimum distance the card's attach point sits above (or below) the disc
 * centre. It grows with the disc so the 45° run off the rim stays visible
 * when zoomed in.
 */
export const CARD_ANCHOR_RISE = 32;

const CARD_RISE_PAST_RIM = 12;

function anchorRise(discRadius: number): number {
  return Math.max(CARD_ANCHOR_RISE, discRadius + CARD_RISE_PAST_RIM);
}

/** Attach point on the card edge, measured down from its top: the header. */
export const CARD_ATTACH_Y = 18;

const LEADER_MIN_RUN = 10;

const LEADER_CORNER_RADIUS = 8;

export type CardAnchorSide = 'left' | 'right';

export type CardAnchorLift = 'up' | 'down';

export const NODE_CARD_FALLBACK: ScreenSize = { width: 288, height: 208 };

const LAYER_SIZE_FALLBACK: ScreenSize = { width: 1440, height: 900 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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
  lift: CardAnchorLift | null,
  discRadius: number,
): {
  readonly write: FollowerWrite;
  readonly side: CardAnchorSide;
  readonly lift: CardAnchorLift;
} {
  const placement = placeAnchoredCard({
    anchor: screenAnchor,
    card,
    viewport: layer,
    side,
    lift,
    discRadius,
  });
  return {
    write: {
      transform: `translate(${placement.left}px, ${placement.top}px)`,
      side: placement.side,
      leader: placement.leader,
    },
    side: placement.side,
    lift: placement.lift,
  };
}

/**
 * The callout from a disc to its card: off the rim at 45° until level with
 * the card header, then straight into the card's near edge. When the card is
 * level with the disc it is a single horizontal run.
 */
export function anchoredLeader(input: {
  readonly anchor: ScreenPoint;
  readonly attach: ScreenPoint;
  readonly side: CardAnchorSide;
  readonly discRadius: number;
}): AnchoredLeader | null {
  const { anchor, attach, side, discRadius } = input;
  const sx = side === 'right' ? 1 : -1;
  const reach = (attach.x - anchor.x) * sx;
  if (reach - discRadius < LEADER_MIN_RUN) return null;

  const rise = attach.y - anchor.y;
  const diagonal = Math.min(Math.abs(rise), reach - LEADER_MIN_RUN);
  const elbow: ScreenPoint = { x: anchor.x + sx * diagonal, y: attach.y };
  const bend = Math.abs(rise) >= 1 && diagonal > discRadius;
  const aim = bend ? elbow : attach;
  const start = pointOnRayAtRadius(anchor, aim, discRadius) ?? anchor;
  const end: ScreenPoint = bend ? attach : { x: attach.x, y: start.y };
  const points = bend ? [start, elbow, end] : [start, end];
  return { d: roundedLeaderPath(points, LEADER_CORNER_RADIUS), start, end };
}

function chooseLift(
  preferred: CardAnchorLift | null,
  anchor: ScreenPoint,
  rise: number,
  padding: number,
): CardAnchorLift {
  if (preferred !== null) return preferred;
  return anchor.y - rise - CARD_ATTACH_Y >= padding ? 'up' : 'down';
}

export function placeAnchoredCard(input: {
  readonly anchor: ScreenPoint;
  readonly card: ScreenSize;
  readonly viewport: ScreenSize;
  readonly gap?: number;
  readonly padding?: number;
  readonly discRadius?: number;
  readonly side?: CardAnchorSide | null;
  readonly lift?: CardAnchorLift | null;
}): {
  readonly left: number;
  readonly top: number;
  readonly leader: AnchoredLeader | null;
  readonly side: CardAnchorSide;
  readonly lift: CardAnchorLift;
} {
  const gap = input.gap ?? CARD_ANCHOR_GAP;
  const padding = input.padding ?? CARD_VIEWPORT_PADDING;
  const radius = input.discRadius ?? 0;
  const { anchor, card, viewport } = input;

  const side: CardAnchorSide =
    input.side ?? (anchor.x >= viewport.width / 2 ? 'left' : 'right');
  const rise = anchorRise(radius);
  const lift = chooseLift(input.lift ?? null, anchor, rise, padding);
  const attachY = anchor.y + (lift === 'up' ? -rise : rise);
  let left = side === 'left'
    ? anchor.x - radius - gap - card.width
    : anchor.x + radius + gap;
  let top = attachY - CARD_ATTACH_Y;

  const maxLeft = Math.max(padding, viewport.width - card.width - padding);
  const maxTop = Math.max(padding, viewport.height - card.height - padding);
  left = clamp(left, padding, maxLeft);
  top = clamp(top, padding, maxTop);

  const leader = anchoredLeader({
    anchor,
    attach: { x: side === 'right' ? left : left + card.width, y: top + CARD_ATTACH_Y },
    side,
    discRadius: radius,
  });
  return { left, top, leader, side, lift };
}

function measureCardSize(
  element: HTMLElement,
  fallback: ScreenSize,
): ScreenSize {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  if (width <= 0 || height <= 0) return fallback;
  return { width, height };
}

function measureLayerSize(domNode: HTMLElement | null): ScreenSize {
  if (domNode === null) return LAYER_SIZE_FALLBACK;
  const width = domNode.clientWidth;
  const height = domNode.clientHeight;
  if (width <= 0 || height <= 0) return LAYER_SIZE_FALLBACK;
  return { width, height };
}

export function applyFollowerWrite(
  card: HTMLElement,
  leaderPath: SVGPathElement | null,
  leaderToken: SVGCircleElement | null,
  payload: FollowerWrite,
): void {
  card.style.setProperty('--map-window-transform', payload.transform);
  card.dataset.anchorSide = payload.side;
  if (leaderPath === null) return;
  if (payload.leader === null) {
    leaderPath.setAttribute('visibility', 'hidden');
    leaderToken?.setAttribute('visibility', 'hidden');
    return;
  }
  leaderPath.setAttribute('d', payload.leader.d);
  leaderPath.setAttribute('visibility', 'visible');
  if (leaderToken !== null) {
    leaderToken.setAttribute('cx', String(payload.leader.start.x));
    leaderToken.setAttribute('cy', String(payload.leader.start.y));
    leaderToken.setAttribute('visibility', 'visible');
  }
}

export interface FollowerBaseline {
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
  readonly lift: CardAnchorLift;
}

export interface FollowerDecision {
  readonly write: FollowerWrite;
  readonly baseline: FollowerBaseline;
}

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
    baseline !== null && baseline.anchorId === anchorId ? baseline.side : null,
    baseline !== null && baseline.anchorId === anchorId ? baseline.lift : null,
    (SYSTEM_DISC_SIZE / 2) * zoom,
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
    lift: placed.lift,
  };
  if (
    baseline !== null &&
    baseline.anchorId === next.anchorId &&
    baseline.x === next.x &&
    baseline.y === next.y &&
    baseline.width === next.width &&
    baseline.height === next.height &&
    baseline.side === next.side &&
    baseline.lift === next.lift &&
    sameSharedFollowerFrame(baseline, next)
  ) {
    return null;
  }

  return {
    write: placed.write,
    baseline: next,
  };
}

export interface FollowerScheduler {
  readonly schedule: (callback: () => void) => number;
  readonly cancel: (handle: number) => void;
}

const BROWSER_SCHEDULER: FollowerScheduler = {
  schedule: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

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
