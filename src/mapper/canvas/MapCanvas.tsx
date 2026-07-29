'use client';

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const EMPTY_NODES: Node[] = [];
const EMPTY_EDGES: Edge[] = [];

/**
 * Renders the map's full-viewport empty React Flow surface with clamped zoom.
 */
export function MapCanvas() {
  return (
    <div data-map-canvas className="h-full w-full">
      <ReactFlow
        nodes={EMPTY_NODES}
        edges={EMPTY_EDGES}
        minZoom={0.2}
        maxZoom={2.5}
      >
        <Background variant={BackgroundVariant.Dots} />
      </ReactFlow>
    </div>
  );
}
