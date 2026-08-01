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
  type SelectionDragHandler,
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
  readonly onSelectionDragStart?: SelectionDragHandler<ChainNode>;
  readonly onSelectionDragStop?: SelectionDragHandler<ChainNode>;
}

/**
 * Renders the dotted, zoom-clamped flow surface for the supplied nodes and edges.
 *
 * Pointer drag is deliberately the ONLY way a node moves here, and nothing on this surface removes
 * one. React Flow's defaults would otherwise give the session two mutation-shaped affordances it does
 * not own: `deleteKeyCode` defaults to `Backspace`, whose `remove` change would delete a node from
 * this client's view with no path back (the reconciler only rebuilds on a server change), and
 * `disableKeyboardA11y` defaults to `false`, so arrow keys move a node without any drag start or stop
 * — no `user` placement is ever stamped, and the next merge snaps it back, breaking DC-2. This session
 * reads only (OOS-3), so both are switched off rather than half-supported.
 */
export function ChainSurface({
  nodes,
  edges,
  onNodesChange,
  onNodeDragStart,
  onNodeDragStop,
  onSelectionDragStart,
  onSelectionDragStop,
}: ChainSurfaceProps) {
  return (
    <ReactFlow
      nodes={nodes as ChainNode[]}
      edges={edges as Edge[]}
      nodeTypes={NODE_TYPES}
      minZoom={0.2}
      maxZoom={2.5}
      deleteKeyCode={null}
      disableKeyboardA11y
      onNodesChange={onNodesChange}
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={onNodeDragStop}
      onSelectionDragStart={onSelectionDragStart}
      onSelectionDragStop={onSelectionDragStop}
    >
      <Background variant={BackgroundVariant.Dots} />
    </ReactFlow>
  );
}
