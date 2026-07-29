'use client';

import { Background, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

/**
 * The map's full-viewport React Flow surface. Renders an empty graph over a dot
 * background with wheel-zoom, drag-pan and clamped zoom. Holds no node state and
 * reads no map data; later sessions supply both through this component's props.
 */
export function MapCanvas() {
  return (
    <div className="absolute inset-0" data-map-canvas>
      <ReactFlow
        nodes={[]}
        edges={[]}
        minZoom={0.2}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
      </ReactFlow>
    </div>
  );
}
