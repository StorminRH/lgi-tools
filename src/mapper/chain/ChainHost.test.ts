import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authed: true,
  useMapChain: vi.fn(),
  reactFlow: vi.fn(),
}));

vi.mock('@/data/convex/use-convex-authed', () => ({
  useConvexAuthed: () => mocks.authed,
}));

vi.mock('./use-map-chain', () => ({
  useMapChain: mocks.useMapChain,
}));

vi.mock('@xyflow/react', async () => {
  const { createElement: element } = await import('react');
  mocks.reactFlow.mockImplementation(({ children }: { children?: unknown }) =>
    element('div', { 'data-react-flow': '' }, children as never),
  );
  return {
    ReactFlow: mocks.reactFlow,
    Background: () => element('div', { 'data-react-flow-background': '' }),
    BackgroundVariant: { Dots: 'dots' },
    Handle: () => element('div', { 'data-handle': '' }),
    Position: { Left: 'left', Right: 'right' },
    applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
  };
});

async function renderHost(): Promise<string> {
  const { ChainHost } = await import('./ChainHost');
  return renderToStaticMarkup(createElement(ChainHost, { mapId: 'map-a' }));
}

describe('chain host auth gate', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.reactFlow.mockClear();
    mocks.useMapChain.mockClear();
    mocks.useMapChain.mockReturnValue({
      state: { systems: new Map(), connections: new Map() },
      intents: [],
      labelOf: (systemId: number) => ({ name: String(systemId), className: null }),
      pinPlacement: vi.fn(),
    });
    mocks.authed = true;
  });

  // The regression this guards: subscribing before the JWT attaches takes an UNAUTHENTICATED
  // rejection, which is not a FORBIDDEN revocation and so escapes the calm-state boundary.
  it('opens no subscription until Convex holds an identity', async () => {
    mocks.authed = false;

    const markup = await renderHost();

    expect(mocks.useMapChain).not.toHaveBeenCalled();
    expect(markup).toContain('data-react-flow-background');
  });

  it('renders the canvas immediately and empty while unauthenticated, with no spinner', async () => {
    mocks.authed = false;

    const markup = await renderHost();
    const props = mocks.reactFlow.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(props.nodes).toEqual([]);
    expect(props.edges).toEqual([]);
    expect(markup).not.toMatch(/progressbar|aria-busy|spinner|loading/i);
  });

  it('subscribes once Convex is authenticated', async () => {
    mocks.authed = true;

    await renderHost();

    expect(mocks.useMapChain).toHaveBeenCalledTimes(1);
    expect(mocks.useMapChain.mock.calls[0]?.[0]).toBe('map-a');
  });
});
