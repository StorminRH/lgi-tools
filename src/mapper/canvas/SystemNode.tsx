'use client';

// One system node on the chain canvas: a directory-resolved name plus an optional class chip.
//
// The chip is omitted rather than shown empty when the class is unknown (contract DC-3), and an
// unresolved system falls back to its bare id, which is a plainer label rather than a loading state
// (contract HC-5). Motion presentation (4.0.3.2) is a class on this inner element — scale and
// opacity only, never position — and is suppressed wholesale while the node is being dragged (HC-2).
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { cn } from '@/components/ui/cn';

/**
 * A node's motion presentation, derived per render by the motion layer
 * (4.0.3.2). Presentation only: it never feeds position or any synchronized
 * state (contract HC-4).
 */
export type NodeMotion = {
  readonly phase: 'entering' | 'departing';
  /** Departures only: whether the heavier chain-collapse exit plays. */
  readonly heavy?: boolean;
};

/**
 * What one node displays. A type alias rather than an interface so it satisfies React Flow's
 * `Record<string, unknown>` data constraint.
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
 * The disc's radius in canvas pixels — `size-[44px]` below is its diameter,
 * deliberately in px (not a rem-derived spacing step) so browser base-font
 * settings cannot desynchronize the rendered disc from this constant.
 * `ChainLinkEdge` clips every connection to this circumference, so the two
 * must move together.
 */
export const SYSTEM_DISC_RADIUS = 22;

/**
 * The handles exist because React Flow requires them for an edge's endpoints
 * to be valid; the chain edge computes its own rim-to-rim geometry and never
 * reads their positions. They stay invisible and inert at the disc's center.
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

/** Renders one system as a class-labeled disc with its name beneath. */
function SystemNodeComponent({ data, dragging }: NodeProps<ChainNode>) {
  return (
    <div
      data-chain-node
      data-dragging={dragging || undefined}
      className={cn(
        'flex flex-col items-center gap-1',
        nodeMotionClass(data.motion, dragging),
      )}
    >
      <div className="map-node-disc relative flex size-[44px] items-center justify-center rounded-full border border-border-idle bg-section">
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
      <span className="font-data text-ui text-name">{data.name}</span>
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
