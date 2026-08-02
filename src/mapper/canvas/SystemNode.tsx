'use client';

// One system node on the chain canvas: a directory-resolved name plus an optional class chip.
//
// The chip is omitted rather than shown empty when the class is unknown (contract DC-3), and an
// unresolved system falls back to its bare id, which is a plainer label rather than a loading state
// (contract HC-5).
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

/**
 * What one node displays. A type alias rather than an interface so it satisfies React Flow's
 * `Record<string, unknown>` data constraint.
 */
export type ChainNodeData = {
  name: string;
  className: string | null;
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

/** Renders one system as a class-labeled disc with its name beneath. */
export function SystemNode({ data }: NodeProps<ChainNode>) {
  return (
    <div data-chain-node className="flex flex-col items-center gap-1">
      <div className="relative flex size-[44px] items-center justify-center rounded-full border border-border-idle bg-section">
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
