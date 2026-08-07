'use client';

// One system node on the chain canvas: an invisible widget frame whose bounds
// ARE the node box — the system name in the frame header, the class-labeled
// disc centered inside, and widget slots along the bottom edge for at-a-glance
// indicators (pilot presence first; gas/anomaly readouts extend it later).
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
import { memo } from 'react';
import { cn } from '@/components/ui/cn';
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
  motion?: NodeMotion;
};

/** The only node kind this session ships. */
export type ChainNode = Node<ChainNodeData, 'chainSystem'>;

/** The node type key registered with React Flow. */
export const CHAIN_NODE_TYPE = 'chainSystem';

/**
 * The widget frame's width in canvas pixels — the node box every consumer
 * shares: `syncNodes` declares it on the node object, `edge-geometry` clips
 * connection lines to this box, and the camera pads fit bounds with it.
 * Deliberately px (not rem-derived) so browser base-font settings cannot
 * desynchronize the rendered frame from these constants.
 */
export const SYSTEM_FRAME_WIDTH = 120;

/** The widget frame's height in canvas pixels; see `SYSTEM_FRAME_WIDTH`. */
export const SYSTEM_FRAME_HEIGHT = 88;

/**
 * The handles exist because React Flow requires them for an edge's endpoints
 * to be valid; the chain edge computes its own frame-to-frame geometry and
 * never reads their positions. They stay invisible and inert at the disc's
 * center (opacity, not `display: none` — a display-none handle would measure
 * at the frame's top-left corner).
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

/** Renders one system as a widget frame: header name, centered disc, widget slots. */
function SystemNodeComponent({ id, data, dragging }: NodeProps<ChainNode>) {
  return (
    <div
      data-chain-node
      data-dragging={dragging || undefined}
      className={cn('relative h-full w-full', nodeMotionClass(data.motion, dragging))}
    >
      <span
        data-chain-node-name
        className="absolute inset-x-1 top-1 truncate text-center font-data text-ui text-name"
      >
        {data.name}
      </span>
      <div className="map-node-disc absolute left-1/2 top-1/2 flex size-[44px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-idle bg-section">
        <Handle type="target" position={Position.Left} className={CENTER_HANDLE_CLASS} />
        {data.className !== null && (
          <span
            data-chain-node-class
            className="font-data text-micro uppercase tracking-label text-muted"
          >
            {data.className}
          </span>
        )}
        <Handle type="source" position={Position.Right} className={CENTER_HANDLE_CLASS} />
      </div>
      <div
        data-chain-node-widgets
        className="absolute inset-x-1 bottom-1 flex items-center justify-center gap-1"
      >
        <PilotPresenceBadge systemId={Number(id)} />
      </div>
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
