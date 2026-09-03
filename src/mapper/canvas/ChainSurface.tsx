'use client';

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

const NODE_TYPES = { [CHAIN_NODE_TYPE]: SystemNode };
const EDGE_TYPES = { [CHAIN_EDGE_TYPE]: ChainLinkEdge };

const DEFAULT_EDGE_OPTIONS = { type: CHAIN_EDGE_TYPE };

const PRO_OPTIONS = { hideAttribution: true } as const;

export interface ChainSurfaceProps {
  readonly nodes: readonly ChainNode[];
  readonly edges: readonly Edge[];
  readonly onNodesChange?: (changes: NodeChange<ChainNode>[]) => void;
  readonly onNodeDragStart?: OnNodeDrag<ChainNode>;
  readonly onNodeDragStop?: OnNodeDrag<ChainNode>;
  readonly onSelectionDragStart?: SelectionDragHandler<ChainNode>;
  readonly onSelectionDragStop?: SelectionDragHandler<ChainNode>;
  readonly onNodeClick?: NodeMouseHandler<ChainNode>;
  readonly onNodeContextMenu?: NodeMouseHandler<ChainNode>;
  readonly onEdgeContextMenu?: EdgeMouseHandler;
  readonly nodesDraggable?: boolean;
  readonly motion?: MotionConfig;
  readonly children?: ReactNode;
}

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
        className="bg-transparent!"
      >
        {children}
      </ReactFlow>
    </div>
  );
}
