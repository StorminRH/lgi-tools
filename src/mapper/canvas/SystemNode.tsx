'use client';

// One system node on the chain canvas: an invisible widget frame whose bounds
// ARE the node box — the plain system name in the frame header, its colored
// class/security indicator centered inside the disc, and widget slots on the
// disc (pilot presence on the top-right rim first; gas/anomaly readouts extend
// the rail later).
//
// The frame is declared data-side (`width`/`height` on the node object, set by
// `syncNodes`) so React Flow sizes the wrapper before any DOM measurement:
// edges, camera fits, and followers all see the frame box from first paint.
// This component fills that box rather than sizing it.
//
// The class chip is omitted rather than shown empty when the class is unknown
// (contract DC-3), and an unresolved system falls back to its bare id, which is
// a plainer label rather than a loading state (contract HC-5). Motion
// presentation (4.0.3.2) is a class on this inner element — scale and opacity
// only, never position — and is suppressed wholesale while the node is being
// dragged (HC-2).
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo, useEffect, useRef } from 'react';
import { cn } from '@/components/ui/cn';
import {
  systemClassificationReadout,
  systemDestinationClassReadout,
  systemDestinationHintReadout,
} from '@/data/eve-data/system-identity';
import type { WormholeDestinationHint } from '@/data/eve-data/wormhole-contract';
import type { NodeMotion } from '../motion/motion-contract';
import { PilotPresenceBadge } from './PilotPresenceBadge';

/**
 * What one node displays. A type alias rather than an interface so it satisfies React Flow's
 * `Record<string, unknown>` data constraint. The motion vocabulary (`NodeMotion`)
 * is owned by `../motion/motion-contract`.
 */
export type ChainNodeData = {
  name: string;
  className: string | null;
  security?: number | null;
  whClassId?: number | null;
  /**
   * Scanned unresolved stubs only: the stored Leads-to bucket. Typed near-side
   * codes still win via `whClassId`; this is the fallback when that is null
   * (K162 / untyped).
   */
  destinationHint?: WormholeDestinationHint | null;
  motion?: NodeMotion;
  /**
   * Present only on derived halo systems (4.0.4.2.3 OW3); an authored node
   * carries no halo field. `fogged` marks the ring under the fog layer: the
   * node is placed (so fog recession reveals it in place) but renders fully
   * transparent and inert — the cloud paints below the node layer, so the
   * node hides itself rather than relying on paint order.
   */
  halo?: { readonly ring: number; readonly fogged: boolean };
  /** Present only on a scanned wormhole or guaranteed-static derived ghost. */
  stub?:
    | {
        readonly connectionId: string;
        readonly fromSystemId: number;
        readonly signatureId: string;
      }
    | {
        readonly staticId: string;
        readonly fromSystemId: number;
        readonly code: string;
        readonly className: string;
        readonly whClassId: number;
      };
};

/** The only node kind this session ships. */
export type ChainNode = Node<ChainNodeData, 'chainSystem'>;

/** The node type key registered with React Flow. */
export const CHAIN_NODE_TYPE = 'chainSystem';

/**
 * The widget frame's width in canvas pixels — the node box every consumer
 * shares: `syncNodes` declares it on the node object, `edge-geometry` aims
 * through this box's center (the disc sits there), and the camera pads fit
 * bounds with it. Deliberately px (not rem-derived) so browser base-font
 * settings cannot desynchronize the rendered frame from these constants.
 */
export const SYSTEM_FRAME_WIDTH = 150;

/** The widget frame's height in canvas pixels; see `SYSTEM_FRAME_WIDTH`. */
export const SYSTEM_FRAME_HEIGHT = 110;

/**
 * Visible system disc diameter in canvas pixels, centered in the widget
 * frame. Connection lines clip to this circle so they pass through the
 * transparent frame and sit under the name and widget rail.
 */
export const SYSTEM_DISC_SIZE = 55;

/**
 * The handles exist because React Flow requires them for an edge's endpoints
 * to be valid; the chain edge computes its own disc-rim geometry and never
 * reads their positions. They stay invisible and inert at the disc's center
 * (opacity, not `display: none` — a display-none handle would measure at the
 * frame's top-left corner).
 */
const CENTER_HANDLE_CLASS =
  'left-1/2! top-1/2! -translate-x-1/2! -translate-y-1/2! opacity-0 pointer-events-none';

/**
 * The motion class for one node's inner element, or `null` for none. A
 * dragging node carries no motion presentation whatever its window (HC-2).
 */
export function nodeMotionClass(
  motion: NodeMotion | undefined,
  dragging: boolean,
): string | null {
  if (dragging || motion === undefined) return null;
  if (motion.phase === 'entering') return 'map-node-enter';
  return motion.heavy === true ? 'map-node-exit-heavy' : 'map-node-exit';
}

/** Pure presentation flags shared by every authored, halo, and stub node render. */
function nodePresentation(data: ChainNodeData) {
  const stub = data.stub !== undefined;
  const staticStub = data.stub !== undefined && 'staticId' in data.stub;
  const fogged = data.halo?.fogged === true;
  const exiting = data.motion !== undefined && data.motion.phase !== 'entering';
  return {
    stub,
    staticStub,
    fogged,
    derived: data.halo !== undefined || stub,
    chromeClass: fogged || stub || exiting ? null : 'pointer-events-auto',
  } as const;
}

/**
 * The header line for one node. Systems keep their name and scanned stubs keep
 * their signature id; guaranteed-static stubs use their wormhole code. Every
 * header stays neutral while derived ghosts remain visually provisional
 * through the frame's opacity.
 */
function nodeHeader(data: ChainNodeData): {
  readonly text: string;
  readonly toneClass: string;
} {
  return { text: data.name, toneClass: 'text-name' };
}

/**
 * Font size that keeps one chip label on a single line inside the disc.
 * `scrollWidth` is the unwrapped glyph width; `clientWidth` is the disc's
 * usable inner width. Short labels keep `basePx`; long ones shrink toward
 * `minPx` instead of wrapping.
 */
export function chipFontSizePx(
  scrollWidth: number,
  clientWidth: number,
  basePx: number,
  minPx = 8,
): number {
  if (!(basePx > 0) || clientWidth <= 0 || scrollWidth <= clientWidth) {
    return basePx;
  }
  return Math.max(minPx, (basePx * clientWidth) / scrollWidth);
}

/** Colored class/security chip that scales to the disc instead of wrapping. */
function ClassificationChip({
  label,
  tone,
}: {
  readonly label: string;
  readonly tone: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    el.style.removeProperty('--chip-fs');
    const basePx = Number.parseFloat(getComputedStyle(el).fontSize);
    const fitted = chipFontSizePx(el.scrollWidth, el.clientWidth, basePx);
    if (fitted < basePx) {
      el.style.setProperty('--chip-fs', `${fitted}px`);
    }
  }, [label]);
  return (
    <span
      ref={ref}
      data-chain-node-classification
      className={cn(
        'min-w-0 max-w-full overflow-hidden whitespace-nowrap px-0.5 font-ui font-bold uppercase leading-none tracking-optical',
        tone,
      )}
    >
      {label}
    </span>
  );
}

function nodeClassification(data: ChainNodeData, stub: boolean) {
  if (stub) {
    return (
      systemDestinationClassReadout(data.whClassId ?? null)
      ?? systemDestinationHintReadout(data.destinationHint ?? null)
    );
  }
  return systemClassificationReadout({
    security: data.security ?? null,
    whClassId: data.whClassId ?? null,
  });
}

function NodeDisc({
  derived,
  chromeClass,
  isConnectable,
  classification,
  stub,
  systemId,
}: {
  readonly derived: boolean;
  readonly chromeClass: string | null;
  readonly isConnectable: boolean | undefined;
  readonly classification: { readonly label: string; readonly tone: string } | null;
  readonly stub: boolean;
  readonly systemId: number;
}) {
  return (
    <div
      className={cn(
        'map-node-disc absolute left-1/2 top-1/2 flex size-[55px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-idle bg-section',
        derived && 'border-dashed',
        chromeClass,
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className={CENTER_HANDLE_CLASS}
      />
      {classification !== null ? (
        <ClassificationChip
          label={classification.label}
          tone={classification.tone}
        />
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className={CENTER_HANDLE_CLASS}
      />
      <div
        data-chain-node-widgets
        className="absolute -right-[16px] -top-[4px] flex items-center justify-end gap-0.5"
      >
        {stub ? null : <PilotPresenceBadge systemId={systemId} />}
      </div>
    </div>
  );
}

/** Renders one system as a widget frame: header name, centered disc, widget slots. */
function SystemNodeComponent({ id, data, dragging, isConnectable }: NodeProps<ChainNode>) {
  const { stub, staticStub, derived, fogged, chromeClass } = nodePresentation(data);
  const header = nodeHeader(data);
  const classification = nodeClassification(data, stub);
  // The wrapper is pointer-inert for every node (`INERT_NODE_STYLE` in
  // chain/nodes.ts); only the visible chrome re-enables pointer events, so
  // the invisible frame margin cannot catch clicks, drags, or hovers. Ghosts
  // (exit motion) and the fogged ring re-enable nothing and stay fully inert.
  return (
    <div
      data-chain-node
      aria-hidden={fogged || undefined}
      data-dragging={dragging || undefined}
      data-chain-node-derived={derived || undefined}
      data-chain-node-fogged={fogged || undefined}
      data-chain-node-stub={stub || undefined}
      data-chain-node-static-stub={staticStub || undefined}
      className={cn(
        'relative h-full w-full',
        derived && (fogged ? 'opacity-0' : 'opacity-75'),
        nodeMotionClass(data.motion, dragging),
      )}
    >
      <span
        data-chain-node-name
        className={cn(
          'absolute inset-x-1 top-1 truncate text-center font-ui text-nav font-bold',
          header.toneClass,
          chromeClass,
        )}
      >
        {header.text}
      </span>
      <NodeDisc
        derived={derived}
        chromeClass={chromeClass}
        isConnectable={isConnectable}
        classification={classification}
        stub={stub}
        systemId={Number(id)}
      />
    </div>
  );
}

/**
 * Memoized (drag hardening, IS-5): the moved node still re-renders every drag
 * frame through React Flow's store (its `positionAbsoluteX/Y` props change),
 * but every OTHER node's wrapper receives identical props and skips — the
 * per-frame commit stays proportional to actual movers.
 */
export const SystemNode = memo(SystemNodeComponent);
