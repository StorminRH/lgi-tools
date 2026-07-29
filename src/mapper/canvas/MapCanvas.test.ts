import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const reactFlowCalls: Array<Record<string, unknown>> = [];

vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: Record<string, unknown> & { children?: ReactNode }) => {
    reactFlowCalls.push(props);
    return createElement('div', { 'data-react-flow': 'true' }, props.children);
  },
  Background: () => createElement('div', { 'data-background': 'true' }),
}));

vi.mock('@xyflow/react/dist/style.css', () => ({}));

describe('MapCanvas', () => {
  it('mounts React Flow with clamped zoom, empty graph, and no fitView/resize', async () => {
    reactFlowCalls.length = 0;
    const { MapCanvas } = await import('./MapCanvas');
    const html = renderToStaticMarkup(createElement(MapCanvas));

    expect(html).toContain('data-map-canvas');
    expect(reactFlowCalls).toHaveLength(1);
    const props = reactFlowCalls[0]!;
    expect(props.minZoom).toBe(0.2);
    expect(props.maxZoom).toBe(2.5);
    expect(props.nodes).toEqual([]);
    expect(props.edges).toEqual([]);
    expect(props).not.toHaveProperty('fitView');
    expect(props).not.toHaveProperty('onResize');
    expect(props).not.toHaveProperty('onViewportChange');
    expect(html).toContain('data-background');
  });
});
