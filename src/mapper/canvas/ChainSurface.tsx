'use client';

// The React Flow frame, shared by the live chain and the empty canvas.
//
// It carries no loading state of any kind (contract HC-5 / DC-5): the surface renders immediately
// with whatever nodes exist — none, at first — and nodes arrive as their pages land. There is no
// spinner and no refresh control here or anywhere below it (contract HC-4).
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  type Edge,
  type NodeChange,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CHAIN_NODE_TYPE, SystemNode, type ChainNode } from './SystemNode';

// Stable identity: a fresh object each render would remount every node.
const NODE_TYPES = { [CHAIN_NODE_TYPE]: SystemNode };

/** Props the live host supplies; the empty canvas passes nodes and edges only. */
export interface ChainSurfaceProps {
  readonly nodes: readonly ChainNode[];
  readonly edges: readonly Edge[];
  readonly onNodesChange?: (changes: NodeChange<ChainNode>[]) => void;
  readonly onNodeDragStart?: OnNodeDrag<ChainNode>;
  readonly onNodeDragStop?: OnNodeDrag<ChainNode>;
}

/** Renders the dotted, zoom-clamped flow surface for the supplied nodes and edges. */
export function ChainSurface({
  nodes,
  edges,
  onNodesChange,
  onNodeDragStart,
  onNodeDragStop,
}: ChainSurfaceProps) {
  return (
    <ReactFlow
      nodes={nodes as ChainNode[]}
      edges={edges as Edge[]}
      nodeTypes={NODE_TYPES}
      minZoom={0.2}
      maxZoom={2.5}
      onNodesChange={onNodesChange}
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={onNodeDragStop}
    >
      <Background variant={BackgroundVariant.Dots} />
    </ReactFlow>
  );
}
