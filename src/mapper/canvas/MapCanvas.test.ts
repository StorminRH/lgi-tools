import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapCanvas } from './MapCanvas';

const mocks = vi.hoisted(() => ({
  reactFlow: vi.fn(),
  background: vi.fn(),
}));

vi.mock('@xyflow/react', async () => {
  const { createElement: element } = await import('react');
  mocks.reactFlow.mockImplementation(({ children, ...props }) =>
    element('div', { 'data-react-flow': '', ...props }, children),
  );
  mocks.background.mockImplementation((props) =>
    element('div', { 'data-react-flow-background': '', ...props }),
  );
  return {
    ReactFlow: mocks.reactFlow,
    Background: mocks.background,
    BackgroundVariant: { Dots: 'dots' },
  };
});

describe('MapCanvas', () => {
  beforeEach(() => {
    mocks.reactFlow.mockClear();
    mocks.background.mockClear();
  });

  it('mounts an empty dotted flow with bounded zoom and no camera refit hooks', () => {
    const markup = renderToStaticMarkup(createElement(MapCanvas));
    const props = mocks.reactFlow.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(markup).toContain('data-map-canvas');
    expect(markup).toContain('data-react-flow-background');
    expect(props.nodes).toEqual([]);
    expect(props.edges).toEqual([]);
    expect(props.minZoom).toBe(0.2);
    expect(props.maxZoom).toBe(2.5);
    expect(props).not.toHaveProperty('fitView');
    expect(Object.keys(props).some((key) => /resize/i.test(key))).toBe(false);
  });
});
