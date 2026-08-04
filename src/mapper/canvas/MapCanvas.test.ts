import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reactFlow: vi.fn(),
  background: vi.fn(),
  chainHost: vi.fn(),
  searchParams: new URLSearchParams(),
  convexClient: { present: true } as unknown,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/data/convex/client', () => ({
  get convexClient() {
    return mocks.convexClient;
  },
}));

vi.mock('../chain/ChainHost', async () => {
  const { createElement: element } = await import('react');
  mocks.chainHost.mockImplementation(({ mapId }: { mapId: string }) =>
    element('div', { 'data-chain-host': mapId }),
  );
  return { ChainHost: mocks.chainHost };
});

vi.mock('@xyflow/react', async () => {
  const { createElement: element } = await import('react');
  mocks.reactFlow.mockImplementation(({ children, ...props }) =>
    element('div', { 'data-react-flow': '', ...serializable(props) }, children),
  );
  mocks.background.mockImplementation(() =>
    element('div', { 'data-react-flow-background': '' }),
  );
  return {
    ReactFlow: mocks.reactFlow,
    Background: mocks.background,
    BackgroundVariant: { Dots: 'dots' },
    Handle: () => element('div', { 'data-handle': '' }),
    Position: { Left: 'left', Right: 'right' },
    applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
  };
});

/** Only primitive props survive onto a div; functions and objects would break static markup. */
function serializable(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).filter(([, value]) => typeof value === 'number'),
  );
}

async function renderCanvas(): Promise<string> {
  const { MapCanvas } = await import('./MapCanvas');
  return renderToStaticMarkup(createElement(MapCanvas));
}

/** The unrendered element tree, so the boundary's remount key can be inspected. */
async function canvasTree(): Promise<ReactElement> {
  const { MapCanvas } = await import('./MapCanvas');
  return MapCanvas() as ReactElement;
}

describe('MapCanvas', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.reactFlow.mockClear();
    mocks.background.mockClear();
    mocks.chainHost.mockClear();
    mocks.searchParams = new URLSearchParams();
    mocks.convexClient = { present: true };
  });

  it('mounts an empty flow with bounded zoom and no camera refit hooks', async () => {
    const markup = await renderCanvas();
    const props = mocks.reactFlow.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(markup).toContain('data-map-canvas');
    expect(markup).not.toContain('data-react-flow-background');
    expect(props.nodes).toEqual([]);
    expect(props.edges).toEqual([]);
    expect(props.minZoom).toBe(0.2);
    expect(props.maxZoom).toBe(2.5);
    expect(props.proOptions).toEqual({ hideAttribution: true });
    expect(props).not.toHaveProperty('fitView');
    expect(Object.keys(props).some((key) => /resize/i.test(key))).toBe(false);
  });

  it('opens no subscription without a map query param', async () => {
    await renderCanvas();

    expect(mocks.chainHost).not.toHaveBeenCalled();
  });

  it('mounts the live chain host for an addressed map', async () => {
    mocks.searchParams = new URLSearchParams('map=map-a');

    const markup = await renderCanvas();

    expect(markup).toContain('data-chain-host="map-a"');
    expect(mocks.chainHost).toHaveBeenCalledTimes(1);
  });

  // The null-client gate: `'skip'` alone is not enough because no provider exists above.
  it('renders the empty canvas and mounts no hook when no Convex deployment is configured', async () => {
    mocks.searchParams = new URLSearchParams('map=map-a');
    mocks.convexClient = null;

    const markup = await renderCanvas();
    const props = mocks.reactFlow.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(mocks.chainHost).not.toHaveBeenCalled();
    expect(markup).toContain('data-map-canvas');
    expect(props.nodes).toEqual([]);
  });

  // A map change must not carry the previous map's reconciled nodes or local placements over.
  it('keys the chain host by map id so a map change remounts it', async () => {
    mocks.searchParams = new URLSearchParams('map=map-a');
    const first = await canvasTree();

    vi.resetModules();
    mocks.searchParams = new URLSearchParams('map=map-b');
    const second = await canvasTree();

    const keyOf = (tree: ReactElement) =>
      ((tree.props as { children: ReactElement }).children).key;

    expect(keyOf(first)).toBe('map-a');
    expect(keyOf(second)).toBe('map-b');
  });

  // The calm state is a live value now, so nothing in this path throws and no boundary is warranted;
  // an unexpected error belongs to the map route's own error.tsx.
  it('wraps the host in no error boundary of its own', async () => {
    mocks.searchParams = new URLSearchParams('map=map-a');

    const tree = await canvasTree();
    const child = (tree.props as { children: ReactElement }).children;

    expect(child.type).toBe(mocks.chainHost);
  });
});
