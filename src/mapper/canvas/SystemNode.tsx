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

/** Renders one system's label and class chip, with handles so connections can attach. */
export function SystemNode({ data }: NodeProps<ChainNode>) {
  return (
    <div
      data-chain-node
      className="flex min-w-28 flex-col items-center gap-1 rounded-md border border-line bg-panel px-3 py-2"
    >
      <Handle type="target" position={Position.Left} />
      <span className="font-data text-ui text-name">{data.name}</span>
      {data.className !== null && (
        <span
          data-chain-node-class
          className="font-data text-micro uppercase tracking-label text-muted"
        >
          {data.className}
        </span>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
