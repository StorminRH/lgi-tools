import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authed: true,
  useMapChain: vi.fn(),
  reactFlow: vi.fn(),
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

vi.mock('@base-ui/react/dialog', async () => {
  const { StaticBaseDialog } = await import('@/components/ui/__tests__/static-base-dialog');
  return { Dialog: StaticBaseDialog };
});

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
  useMapTrackingToggle: () => vi.fn(),
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

// The first import transforms the whole canvas graph, and under coverage
// instrumentation that alone can take most of a test's budget on a busy
// machine. Pay it once here so each test times only its own render.
beforeAll(async () => {
  await import('./ChainHost');
}, 120_000);

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
  });
}

function resetHostMocks(): void {
  vi.resetModules();
  mocks.reactFlow.mockClear();
  mocks.useMapChain.mockClear();
  for (const spy of Object.values(mocks.authoring)) {
    spy.mockClear();
  }
  mocks.authed = true;
  withAccess(true);
}

test(
  'chain host shows an empty canvas with no subscription until Convex holds an identity, then subscribes to its map',
  async () => {
    resetHostMocks();
    mocks.authed = false;

    const unauthed = await renderHost();
    const props = mocks.reactFlow.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(mocks.useMapChain).not.toHaveBeenCalled();
    expect(unauthed).toContain('data-react-flow');
    expect(props.nodes).toEqual([]);
    expect(props.edges).toEqual([]);

    resetHostMocks();
    await renderHost();

    expect(mocks.useMapChain).toHaveBeenCalledTimes(1);
    expect(mocks.useMapChain.mock.calls[0]?.[0]).toBe('map-a');
  },
  15_000,
);

test('chain host walks access unknown, withdrawn, view-only, an editor on an empty map, and a map with live systems', async () => {
  resetHostMocks();
  withAccess(undefined);
  const unknown = await renderHost();
  expect(unknown).toContain('data-react-flow');
  expect(unknown).not.toContain('data-chain-no-access');
  expect(unknown).not.toMatch(/progressbar|aria-busy|spinner|loading/i);

  resetHostMocks();
  withAccess(false);
  const withdrawn = await renderHost();
  expect(withdrawn).toContain('data-chain-no-access');
  expect(withdrawn).not.toContain('data-react-flow');
  expect(withdrawn).not.toMatch(/error|try again|refresh|retry/i);

  resetHostMocks();
  withAccess(true, false);
  const viewOnly = await renderHost();
  expect(viewOnly).toContain('data-react-flow');
  expect(viewOnly).toContain('data-map-can-edit="false"');
  expect(viewOnly).not.toContain('data-map-home-prompt');

  resetHostMocks();
  withAccess(true, true);
  const editor = await renderHost();
  expect(editor).not.toContain('data-chain-no-access');
  expect(editor).toContain('data-map-can-edit="true"');
  expect(editor).toContain('data-map-home-prompt');
  expect(editor).toContain('data-map-home-current-disabled');
  expect(editor.indexOf('data-map-home-prompt')).toBeGreaterThan(
    editor.indexOf('data-signature-window-layer'),
  );

  // Live systems hide the prompt even before the merge lands in state.
  resetHostMocks();
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
  });
  const populated = await renderHost();
  expect(populated).not.toContain('data-map-home-prompt');
}, 60_000);

test('chain host never lets a system be dragged or deleted from the keyboard', async () => {
  resetHostMocks();
  await renderHost();
  const props = mocks.reactFlow.mock.calls[0]?.[0] as Record<string, unknown>;

  expect(props.nodesDraggable).toBe(false);
  expect(props.deleteKeyCode).toBeNull();
  expect(props.disableKeyboardA11y).toBe(true);
}, 15_000);
