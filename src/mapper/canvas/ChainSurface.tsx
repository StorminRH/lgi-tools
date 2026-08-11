'use client';

// The React Flow frame, shared by the live chain and the empty canvas.
//
// It carries no loading state of any kind (contract HC-5 / DC-5): the surface renders immediately
// with whatever nodes exist — none, at first — and nodes arrive as their pages land. There is no
// spinner and no refresh control here or anywhere below it (contract HC-4).
import {
  ReactFlow,
  type Edge,
  type EdgeMouseHandler,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodeDrag,
  type SelectionDragHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useRef, type ReactNode } from 'react';
import { motionCssProperties, type MotionConfig } from '../motion/motion-contract';
import { CHAIN_EDGE_TYPE, ChainLinkEdge } from './ChainLinkEdge';
import { CHAIN_NODE_TYPE, SystemNode, type ChainNode } from './SystemNode';

// Stable identity: a fresh object each render would remount every node.
const NODE_TYPES = { [CHAIN_NODE_TYPE]: SystemNode };
const EDGE_TYPES = { [CHAIN_EDGE_TYPE]: ChainLinkEdge };

// Every chain edge renders frame-boundary to frame-boundary through the custom
// edge, so branch shapes read as radial lines rather than overlapping S-curves.
const DEFAULT_EDGE_OPTIONS = { type: CHAIN_EDGE_TYPE };

// Corner badge is relocated into the atlas hamburger footer (MapMenu).
const PRO_OPTIONS = { hideAttribution: true } as const;

/** Props the live host supplies; the empty canvas passes nodes and edges only. */
export interface ChainSurfaceProps {
  readonly nodes: readonly ChainNode[];
  readonly edges: readonly Edge[];
  readonly onNodesChange?: (changes: NodeChange<ChainNode>[]) => void;
  readonly onNodeDragStart?: OnNodeDrag<ChainNode>;
  readonly onNodeDragStop?: OnNodeDrag<ChainNode>;
  readonly onSelectionDragStart?: SelectionDragHandler<ChainNode>;
  readonly onSelectionDragStop?: SelectionDragHandler<ChainNode>;
  /** Node-click seam for the camera's click-to-focus setting. */
  readonly onNodeClick?: NodeMouseHandler<ChainNode>;
  /** Node right-click / long-press seam for the add-from-node menu. */
  readonly onNodeContextMenu?: NodeMouseHandler<ChainNode>;
  /**
   * Edge right-click seam for the connection Edit/Delete menu. React Flow
   * passes the event straight through without calling `preventDefault`, so the
   * handler must suppress the native menu itself. Built-in click-to-select is
   * governed separately (`elementsSelectable`) and stays as shipped.
   */
  readonly onEdgeContextMenu?: EdgeMouseHandler;
  /**
   * Whether nodes may be dragged. Default `true` preserves the empty-canvas
   * contract; the live host passes the map-lock state (locked → false).
   */
  readonly nodesDraggable?: boolean;
  /**
   * Live motion dial state. When present, the surface's container element
   * carries the `--map-motion-*` custom properties the stylesheet motion
   * rules consume — written through CSSOM per the house no-JSX-style rule.
   * The empty canvas omits it and the stylesheet falls back to its defaults.
   */
  readonly motion?: MotionConfig;
  /**
   * Mounted inside `<ReactFlow>` — the only legal home for React Flow `Panel`
   * and `useReactFlow` consumers (map controls, camera follow).
   */
  readonly children?: ReactNode;
}

/**
 * Renders the zoom-clamped flow surface for the supplied nodes and edges.
 * No RF Background — the sitewide nebula backdrop shows through.
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
  onNodeClick,
  onNodeContextMenu,
  onEdgeContextMenu,
  nodesDraggable = true,
  motion,
  children,
}: ChainSurfaceProps) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scopeRef.current;
    if (element === null || motion === undefined) return;
    for (const [property, value] of Object.entries(motionCssProperties(motion))) {
      element.style.setProperty(property, value);
    }
  }, [motion]);

  return (
    <div ref={scopeRef} data-map-motion-scope className="h-full w-full">
      <ReactFlow
        nodes={nodes as ChainNode[]}
        edges={edges as Edge[]}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        minZoom={0.2}
        maxZoom={2.5}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        proOptions={PRO_OPTIONS}
        deleteKeyCode={null}
        disableKeyboardA11y
        nodesDraggable={nodesDraggable}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onSelectionDragStart={onSelectionDragStart}
        onSelectionDragStop={onSelectionDragStop}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        // RF's dark theme paints a solid pane; keep it clear so the nebula shows.
        className="bg-transparent!"
      >
        {children}
      </ReactFlow>
    </div>
  );
}
