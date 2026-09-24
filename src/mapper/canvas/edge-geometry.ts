import { systemSecurityClass } from '@/data/eve-data/security';
import type { ChainPosition } from '../chain/intents';
import {
  ICON_TRACK_CLEARANCE_PX,
  kspaceCaptionOffset,
} from './disc-chrome';
import { SYSTEM_FRAME_HEIGHT, SYSTEM_FRAME_WIDTH } from './SystemNode';

const HUB_ROW_PX = 14;
const CAPTION_NAME_PX = 14;
const CAPTION_REGION_PX = 10;
const KSPACE_CAPTION_BLOCK_PX = HUB_ROW_PX + CAPTION_NAME_PX + CAPTION_REGION_PX;
const FRAME_NAME_INSET_PX = 4;
const FRAME_NAME_TOP_PX = 4;
const FRAME_NAME_LINE_PX = 14 * 1.6;

const EDGE_TAPER_PX = 24;

export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameSegment {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
}

export function frameCenter(frame: FrameRect): ChainPosition {
  return { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
}

export interface RayPoint {
  readonly x: number;
  readonly y: number;
}

export function pointOnRayAtRadius(
  origin: RayPoint,
  toward: RayPoint,
  radius: number,
): RayPoint | null {
  const dx = toward.x - origin.x;
  const dy = toward.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return null;
  const t = radius / distance;
  return { x: origin.x + dx * t, y: origin.y + dy * t };
}

export interface LabelBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface EndpointLabels {
  readonly source: LabelBox | null;
  readonly target: LabelBox | null;
}

const NO_LABELS: EndpointLabels = { source: null, target: null };

export interface EndpointData {
  readonly security?: number | null;
  readonly whClassId?: number | null;
  readonly halo?: unknown;
  readonly stub?: unknown;
}

export function kspaceCaptionBox(): LabelBox {
  const half = SYSTEM_FRAME_WIDTH / 2;
  const bottom = kspaceCaptionOffset().y;
  return {
    left: -half,
    right: half,
    top: bottom - KSPACE_CAPTION_BLOCK_PX,
    bottom,
  };
}

export function frameNameBox(): LabelBox {
  const halfW = SYSTEM_FRAME_WIDTH / 2;
  const halfH = SYSTEM_FRAME_HEIGHT / 2;
  const top = FRAME_NAME_TOP_PX - halfH;
  return {
    left: FRAME_NAME_INSET_PX - halfW,
    right: halfW - FRAME_NAME_INSET_PX,
    top,
    bottom: top + FRAME_NAME_LINE_PX,
  };
}

export function connectionLabelBox(data: EndpointData | undefined): LabelBox | null {
  if (data === undefined) return null;
  const derived = data.halo !== undefined || data.stub !== undefined;
  const wormhole =
    systemSecurityClass(data.security ?? null, data.whClassId ?? null) === 'wormhole';
  if (!derived && !wormhole) return kspaceCaptionBox();
  return frameNameBox();
}

function rayFarDistance(dx: number, dy: number, box: LabelBox): number | null {
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const ux = dx / length;
  const uy = dy / length;
  const slabs = [
    { dir: ux, min: box.left, max: box.right },
    { dir: uy, min: box.top, max: box.bottom },
  ];
  let tMin = 0;
  let tMax = Number.POSITIVE_INFINITY;
  for (const slab of slabs) {
    if (slab.dir === 0) {
      if (0 < slab.min || 0 > slab.max) return null;
      continue;
    }
    const t1 = slab.min / slab.dir;
    const t2 = slab.max / slab.dir;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    if (tMin > tMax) return null;
  }
  return tMax < 0 ? null : tMax;
}

function clearanceAlong(dx: number, dy: number, label: LabelBox | null): number {
  const hit = label === null ? null : rayFarDistance(dx, dy, label);
  return Math.max(ICON_TRACK_CLEARANCE_PX, hit ?? 0);
}

export function frameSegment(
  source: FrameRect,
  target: FrameRect,
  labels: EndpointLabels = NO_LABELS,
): FrameSegment | null {
  const from = frameCenter(source);
  const to = frameCenter(target);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return null;
  const sourceClearance = clearanceAlong(dx, dy, labels.source);
  const targetClearance = clearanceAlong(-dx, -dy, labels.target);
  if (distance <= sourceClearance + targetClearance) return null;
  const startPt = pointOnRayAtRadius(from, to, sourceClearance);
  const endPt = pointOnRayAtRadius(to, from, targetClearance);
  if (startPt === null || endPt === null) return null;
  return {
    startX: startPt.x,
    startY: startPt.y,
    endX: endPt.x,
    endY: endPt.y,
  };
}

export function edgeTaperFraction(segment: FrameSegment): number {
  const length = Math.hypot(segment.endX - segment.startX, segment.endY - segment.startY);
  if (!(length > 0)) return 0.5;
  return Math.min(0.5, EDGE_TAPER_PX / length);
}

export interface EdgeEndpointNode {
  readonly internals: { readonly positionAbsolute: { readonly x: number; readonly y: number } };
  readonly measured: { readonly width?: number; readonly height?: number };
  readonly width?: number;
  readonly height?: number;
  readonly data?: EndpointData;
}

export function endpointFrame(node: EdgeEndpointNode | undefined): FrameRect | null {
  if (node === undefined) return null;
  const width = node.measured.width ?? node.width;
  const height = node.measured.height ?? node.height;
  if (width === undefined || height === undefined) return null;
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width,
    height,
  };
}

export function chainLinkSegment(
  source: EdgeEndpointNode | undefined,
  target: EdgeEndpointNode | undefined,
): FrameSegment | null {
  const from = endpointFrame(source);
  const to = endpointFrame(target);
  if (from === null || to === null || source === undefined || target === undefined) return null;
  return frameSegment(from, to, {
    source: connectionLabelBox(source.data),
    target: connectionLabelBox(target.data),
  });
}

function segmentPath(segment: FrameSegment, start: number, end: number): string {
  const dx = segment.endX - segment.startX;
  const dy = segment.endY - segment.startY;
  const point = (t: number) =>
    `${segment.startX + dx * t},${segment.startY + dy * t}`;
  return `M ${point(start)} L ${point(end)}`;
}

export function chainLinkPath(
  segment: FrameSegment,
  fogSide: 'source' | 'target' | undefined,
  cut: number,
): string {
  if (fogSide === undefined) return segmentPath(segment, 0, 1);
  return fogSide === 'target'
    ? segmentPath(segment, 0, cut)
    : segmentPath(segment, 1 - cut, 1);
}

export function pointAlongSegment(
  segment: FrameSegment,
  fraction: number,
  towardTarget: boolean,
): { readonly x: number; readonly y: number; readonly angle: number } {
  const startX = towardTarget ? segment.startX : segment.endX;
  const startY = towardTarget ? segment.startY : segment.endY;
  const endX = towardTarget ? segment.endX : segment.startX;
  const endY = towardTarget ? segment.endY : segment.startY;
  const dx = endX - startX;
  const dy = endY - startY;
  return {
    x: startX + dx * fraction,
    y: startY + dy * fraction,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}
