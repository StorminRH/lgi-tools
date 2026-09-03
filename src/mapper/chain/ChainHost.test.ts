import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authed: true,
  useMapChain: vi.fn(),
  reactFlow: vi.fn(),
  pinPlacement: vi.fn(),
  authoring: {
    setHomeSystem: vi.fn(),
    addSystemFromNode: vi.fn(),
    setConnectionWormholeType: vi.fn(),
    setConnectionShipSize: vi.fn(),
    setConnectionMassState: vi.fn(),
    setConnectionLifeStage: vi.fn(),
    setConnectionDestinationHint: vi.fn(),
    setConnectionDestination: vi.fn(),
    linkStubToResolvedConnection: vi.fn(),
    severConnection: vi.fn(),
    restoreSeveredBranch: vi.fn(),
    restoreConnection: vi.fn(),
    removeSignatures: vi.fn(),
    restoreSignatures: vi.fn(),
  },
}));

vi.mock('@/data/convex/use-convex-authed', () => ({
  useConvexAuthed: () => mocks.authed,
}));

vi.mock('@/data/convex/use-live-value', () => ({
  useLiveValue: () => undefined,
}));

vi.mock('@/data/convex/use-mutation', () => ({
  useMutation: () => vi.fn(),
}));

vi.mock('@/components/use-account-characters', () => ({
  useActiveCharacterId: () => 1,
  useAccountCharacters: () => null,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) =>
    createElement('div', { role: 'dialog' }, children),
  DialogTitle: ({ children, id }: { children: React.ReactNode; id?: string }) =>
    createElement('h2', { id }, children),
  DialogClose: ({ children }: { children: React.ReactNode }) =>
    createElement('button', null, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) =>
    createElement('p', null, children),
}));

vi.mock('./use-map-chain', () => ({
  useMapChain: mocks.useMapChain,
}));

vi.mock('./optimistic-authoring', () => ({
  useChainAuthoringMutations: () => mocks.authoring,
}));

vi.mock('../authoring/RightsTransitionToast', () => ({
  RightsTransitionToast: () => null,
}));

vi.mock('../authoring/MapAuthoringOverlay', () => ({
  MapAuthoringOverlay: () => null,
}));

vi.mock('../tracking/TrackingControls', () => ({
  TrackingHeartbeat: () => null,
  useSetMapTracking: () => vi.fn(),
}));

vi.mock('../tracking/PresenceProvider', () => ({
  MapPresenceProvider: ({ children }: { children?: unknown }) => children,
}));

vi.mock('../tracking/JumpDoorbellObserver', () => ({
  JumpDoorbellObserver: () => null,
}));

vi.mock('../signatures/SignatureProvider', async () => {
  const { createElement: element } = await import('react');
  return {
    SignatureProvider: ({ children }: { children?: unknown }) =>
      element(
        'div',
        { 'data-signature-provider': '' },
        children as never,
        element('div', { 'data-signature-window-layer': '' }),
      ),
  };
});

vi.mock('@xyflow/react', async () => {
  const { createElement: element } = await import('react');
  mocks.reactFlow.mockImplementation(({ children }: { children?: unknown }) =>
    element('div', { 'data-react-flow': '' }, children as never),
  );
  return {
    ReactFlow: mocks.reactFlow,
    ReactFlowProvider: ({ children }: { children?: unknown }) =>
      element('div', { 'data-react-flow-provider': '' }, children as never),
    Background: () => element('div', { 'data-react-flow-background': '' }),
    BackgroundVariant: { Dots: 'dots' },
    Handle: () => element('div', { 'data-handle': '' }),
    Position: { Left: 'left', Right: 'right' },
    Panel: ({ children }: { children?: unknown }) =>
      element('div', { 'data-react-flow-panel': '' }, children as never),
    ViewportPortal: ({ children }: { children?: unknown }) =>
      element('div', { 'data-viewport-portal': '' }, children as never),
    useOnViewportChange: () => undefined,
    getViewportForBounds: () => ({ x: 0, y: 0, zoom: 0.75 }),
    useReactFlow: () => ({
      fitView: vi.fn(async () => true),
      fitBounds: vi.fn(async () => true),
      setViewport: vi.fn(async () => true),
      setCenter: vi.fn(async () => true),
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      getInternalNode: () => undefined,
      viewportInitialized: true,
    }),
    useStore: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        userSelectionActive: false,
        width: 1440,
        height: 900,
        minZoom: 0.2,
        maxZoom: 2.5,
      }),
    useStoreApi: () => ({
      getState: () => ({
        domNode: null,
        transform: [0, 0, 1],
        nodeLookup: new Map(),
      }),
      subscribe: () => () => undefined,
    }),
    applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
  };
});

async function renderHost(): Promise<string> {
  const { ChainHost } = await import('./ChainHost');
  return renderToStaticMarkup(createElement(ChainHost, { mapId: 'map-a' }));
}

function withAccess(
  access: boolean | undefined,
  canEdit: boolean | undefined = access === true,
): void {
  mocks.useMapChain.mockReturnValue({
    access,
    canEdit,
    systemsComplete: true,
    liveSystemCount: 0,
    connectionDetails: new Map(),
    unresolvedHoles: [],
    connectionPresentationNow: 1,
    events: [],
    state: { systems: new Map(), connections: new Map() },
    intents: [],
    labelOf: (systemId: number) => ({
      name: String(systemId),
      className: null,
      security: null,
      whClassId: null,
    }),
    treeParents: new Map(),
    rootSystemId: null,
    halo: { systems: [], links: [] },
    stubs: [],
    neighboursOf: () => [],
    pinPlacement: mocks.pinPlacement,
    releasePlacements: vi.fn(),
  });
}

function resetHostMocks(): void {
  vi.resetModules();
  mocks.reactFlow.mockClear();
  mocks.useMapChain.mockClear();
  mocks.pinPlacement.mockClear();
  for (const spy of Object.values(mocks.authoring)) {
    spy.mockClear();
  }
  mocks.authed = true;
  withAccess(true);
}

function surfaceProps(): Record<string, (...args: never[]) => void> {
  return mocks.reactFlow.mock.calls[0]?.[0] as Record<string, (...args: never[]) => void>;
}

function node(systemId: number, x: number, y: number) {
  return { id: String(systemId), position: { x, y }, data: {} };
}

function stubNode(connectionId: string, x: number, y: number) {
  return {
    id: `stub:${connectionId}`,
    position: { x, y },
    data: { stub: { connectionId, fromSystemId: 30_000_142, signatureId: 'ABC-123' } },
  };
}

describe('chain host auth gate', () => {
  beforeEach(resetHostMocks);

  it(
    'opens no subscription until Convex holds an identity',
    async () => {
      mocks.authed = false;

      const markup = await renderHost();

      expect(mocks.useMapChain).not.toHaveBeenCalled();
      expect(markup).toContain('data-react-flow');
      expect(markup).not.toContain('data-react-flow-background');
    },
    15_000,
  );

  it(
    'renders the canvas immediately and empty while unauthenticated, with no spinner',
    async () => {
      mocks.authed = false;

      const markup = await renderHost();
      const props = mocks.reactFlow.mock.calls[0]?.[0] as Record<string, unknown>;

      expect(props.nodes).toEqual([]);
      expect(props.edges).toEqual([]);
      expect(markup).not.toMatch(/progressbar|aria-busy|spinner|loading/i);
    },
    15_000,
  );

  it(
    'subscribes once Convex is authenticated',
    async () => {
      mocks.authed = true;

      await renderHost();

      expect(mocks.useMapChain).toHaveBeenCalledTimes(1);
      expect(mocks.useMapChain.mock.calls[0]?.[0]).toBe('map-a');
    },
    15_000,
  );
});

describe('chain host access states', () => {
  beforeEach(resetHostMocks);

  it('renders the calm no-access state when access is withdrawn', async () => {
    withAccess(false);

    const markup = await renderHost();

    expect(markup).toContain('data-chain-no-access');
    expect(markup).toContain('lost access to this map');
    expect(markup).not.toContain('data-react-flow');
    expect(markup).not.toMatch(/error|try again|refresh|retry/i);
  });

  it('renders the canvas, not the calm state, once access is held', async () => {
    withAccess(true, true);

    const markup = await renderHost();

    expect(markup).toContain('data-react-flow');
    expect(markup).not.toContain('data-react-flow-background');
    expect(markup).not.toContain('data-chain-no-access');
    expect(markup).toContain('data-map-can-edit="true"');
  });

  it('exposes canEdit=false for a view-only claim', async () => {
    withAccess(true, false);

    const markup = await renderHost();

    expect(markup).toContain('data-map-can-edit="false"');
    expect(markup).not.toContain('data-map-home-prompt');
  });

  it('shows the home prompt only for an editor on a complete empty map', async () => {
    withAccess(true, true);

    const markup = await renderHost();

    expect(markup).toContain('data-map-home-prompt');
    expect(markup).toContain('Set your home system');
    expect(markup).toContain('data-map-home-current-disabled');
    expect(markup.indexOf('data-map-home-prompt')).toBeGreaterThan(
      markup.indexOf('data-signature-window-layer'),
    );
  });

  it('hides the home prompt when live systems exist even before merge lands', async () => {
    mocks.useMapChain.mockReturnValue({
      access: true,
      canEdit: true,
      systemsComplete: true,
      liveSystemCount: 1,
      connectionDetails: new Map(),
      state: { systems: new Map(), connections: new Map() },
      intents: [],
      labelOf: (systemId: number) => ({ name: String(systemId), className: null }),
      treeParents: new Map(),
      rootSystemId: null,
      halo: { systems: [], links: [] },
      stubs: [],
      neighboursOf: () => [],
      pinPlacement: mocks.pinPlacement,
      releasePlacements: vi.fn(),
    });

    const markup = await renderHost();

    expect(markup).not.toContain('data-map-home-prompt');
  });

  it('renders the ordinary empty canvas while access is still unknown', async () => {
    withAccess(undefined);

    const markup = await renderHost();

    expect(markup).toContain('data-react-flow');
    expect(markup).not.toContain('data-react-flow-background');
    expect(markup).not.toContain('data-chain-no-access');
    expect(markup).not.toMatch(/progressbar|aria-busy|spinner|loading/i);
  });
});

describe('chain host group drag', () => {
  beforeEach(resetHostMocks);

  it('pins every node a multi-node drag moved, not just the grabbed one', async () => {
    await renderHost();
    const moved = [node(30_000_142, 10, 20), node(30_002_187, 30, 40)];

    surfaceProps().onNodeDragStop?.(
      ...([{}, moved[0], moved] as unknown as never[]),
    );

    expect(mocks.pinPlacement.mock.calls).toEqual([
      [30_000_142, { x: 10, y: 20 }],
      [30_002_187, { x: 30, y: 40 }],
    ]);
  });

  it('pins the grabbed node when a gesture reports no companion set', async () => {
    await renderHost();
    const grabbed = node(30_000_142, 7, 8);

    surfaceProps().onNodeDragStop?.(
      ...([{}, grabbed, []] as unknown as never[]),
    );

    expect(mocks.pinPlacement.mock.calls).toEqual([[30_000_142, { x: 7, y: 8 }]]);
  });

  it('pins every node a selection-rectangle drag moved', async () => {
    await renderHost();
    const moved = [node(30_000_142, 1, 2), node(30_002_187, 3, 4)];

    surfaceProps().onSelectionDragStop?.(...([{}, moved] as unknown as never[]));

    expect(mocks.pinPlacement.mock.calls).toEqual([
      [30_000_142, { x: 1, y: 2 }],
      [30_002_187, { x: 3, y: 4 }],
    ]);
  });

  it('never feeds a synthetic stub id into numeric drag placement', async () => {
    await renderHost();
    const authored = node(30_000_142, 1, 2);
    const stub = stubNode('c1', 300, 0);

    surfaceProps().onNodeDragStop?.(
      ...([{}, authored, [authored, stub]] as unknown as never[]),
    );

    expect(mocks.pinPlacement).toHaveBeenCalledOnce();
    expect(mocks.pinPlacement).toHaveBeenCalledWith(30_000_142, { x: 1, y: 2 });
  });

  it('offers no delete key and no keyboard node movement on the surface', async () => {
    await renderHost();
    const props = mocks.reactFlow.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(props.deleteKeyCode).toBeNull();
    expect(props.disableKeyboardA11y).toBe(true);
  });
});
