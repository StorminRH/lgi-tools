import { readdirSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { NodeProps } from '@xyflow/react';
import { SystemNode, type ChainNode } from '../canvas/SystemNode';
import { NoMapAccess } from './NoMapAccess';

const mocks = vi.hoisted(() => ({ reactFlow: vi.fn() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
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
    getViewportForBounds: () => ({ x: 0, y: 0, zoom: 0.75 }),
    applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
  };
});

function nodeMarkup(name: string, className: string | null): string {
  const props = { data: { name, className } } as unknown as NodeProps<ChainNode>;
  return renderToStaticMarkup(createElement(SystemNode, props));
}

// ── SC-3 · DC-3 — what a populated node actually says ───────────────────────
describe('system node rendering', () => {
  it('shows the directory name and its class chip', () => {
    const markup = nodeMarkup('J123456', 'C5');

    expect(markup).toContain('J123456');
    expect(markup).toContain('data-chain-node-class');
    expect(markup).toContain('C5');
  });

  it('omits the class chip entirely for a system with no class', () => {
    const markup = nodeMarkup('Jita', null);

    expect(markup).toContain('Jita');
    expect(markup).not.toContain('data-chain-node-class');
  });
});

// ── SC-5 · DC-5 / AC-5 / V-4 — no spinner, no refresh control, in any state ──
describe('map surface inspection', () => {
  async function emptyCanvasMarkup(): Promise<string> {
    const { MapCanvas } = await import('../canvas/MapCanvas');
    return renderToStaticMarkup(createElement(MapCanvas));
  }

  // MapCanvas pulls the ChainHost tree; first import under full-suite coverage
  // can exceed the default 5s when workers contend.
  it(
    'renders the canvas frame immediately with no loading state',
    async () => {
      const markup = await emptyCanvasMarkup();

      expect(markup).toContain('data-map-canvas');
      expect(markup).not.toContain('data-react-flow-background');
    },
    15_000,
  );

  it.each(['empty', 'populated', 'calm'])(
    'has no spinner and no refresh control in the %s state',
    async (state) => {
      const markup =
        state === 'empty'
          ? await emptyCanvasMarkup()
          : state === 'populated'
            ? nodeMarkup('J123456', 'C5')
            : renderToStaticMarkup(createElement(NoMapAccess));

      expect(markup).not.toMatch(/progressbar|aria-busy|spinner/i);
      expect(markup).not.toMatch(/refresh|reload|try again|retry/i);
      expect(markup).not.toMatch(/loading/i);
    },
    15_000,
  );
});

// ── SC-7 · DC-7 / AC-7 — the reconciler is the only merge the canvas consumes ─
describe('mapper source contract', () => {
  const ROOT = 'src/mapper';

  function mapperFiles(): string[] {
    return readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
      .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
      .map((name) => name.replaceAll('\\', '/'));
  }

  /**
   * A file's CODE, with comments stripped.
   *
   * Prose naming a forbidden API is not a use of it — these modules document the constraints they
   * uphold, and asserting against raw text would fail on its own documentation.
   */
  function sourceOf(relative: string): string {
    return readFileSync(`${ROOT}/${relative}`, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }

  // Guards every loop below: an empty or broken file walk would make them all pass vacuously.
  it('walks the whole mapper zone', () => {
    expect(mapperFiles().toSorted()).toEqual([
      'authoring/ConnectionAuthoringOverlay.tsx',
      'authoring/ConnectionDetailsCard.tsx',
      'authoring/HomePrompt.tsx',
      'authoring/JumpResolutionPrompt.tsx',
      'authoring/NodeAddMenu.tsx',
      'authoring/RightsTransitionToast.tsx',
      'authoring/connection-field-group.tsx',
      'authoring/connection-field-setters.ts',
      'authoring/connection-fields.tsx',
      'authoring/connection-intelligence.ts',
      'authoring/connection-selection.ts',
      'authoring/jump-resolution.ts',
      'authoring/rights-transition.ts',
      'authoring/sever-toast.ts',
      'authoring/use-wormhole-editor-data.ts',
      'authoring/wormhole-type-search.ts',
      'canvas/ChainLinkEdge.tsx',
      'canvas/ChainSurface.tsx',
      'canvas/MapCanvas.tsx',
      'canvas/MapControls.tsx',
      'canvas/PilotPresenceBadge.tsx',
      'canvas/SystemNode.tsx',
      'canvas/camera-follow-model.ts',
      'canvas/edge-geometry.ts',
      'canvas/map-controls-model.ts',
      'canvas/use-camera-follow.ts',
      'chain/ChainHost.tsx',
      'chain/NoMapAccess.tsx',
      'chain/intents.ts',
      'chain/labels.ts',
      'chain/nodes.ts',
      'chain/optimistic-authoring.ts',
      'chain/placement.ts',
      'chain/reconciler.ts',
      'chain/use-map-chain.ts',
      'fog/FogLayer.tsx',
      'fog/fog-host.ts',
      'fog/fog-model.ts',
      'fog/fog-painter.ts',
      'halo/halo-model.ts',
      'index.ts',
      'jump-client.ts',
      'layout/compass.ts',
      'layout/determinism-fixture.ts',
      'layout/facts.ts',
      'layout/geometry.ts',
      'layout/kernel-requests.ts',
      'layout/layout-contract.ts',
      'layout/layout.worker.ts',
      'layout/overflow.ts',
      'layout/proof-kit.ts',
      'layout/trig.ts',
      'layout/use-layout-kernel.ts',
      'lib/pair-key.ts',
      'lib/prng.ts',
      'log/MapEventLog.tsx',
      'log/map-event-copy.ts',
      'map-frosted-surface.ts',
      'motion/motion-contract.ts',
      'motion/motion-controls-model.ts',
      'motion/motion-host-model.ts',
      'motion/tween-model.ts',
      'motion/use-motion.ts',
      'signatures/SignatureProvider.tsx',
      'signatures/SignatureWindow.tsx',
      'signatures/WormholeRowEditor.tsx',
      'signatures/signature-context.tsx',
      'signatures/signature-model.ts',
      'signatures/signature-toast.ts',
      'signatures/use-scanner-paste.ts',
      'tracking/AfkGate.tsx',
      'tracking/JumpDoorbellObserver.tsx',
      'tracking/OutboundArrowProvider.tsx',
      'tracking/PresenceProvider.tsx',
      'tracking/TrackingControls.tsx',
      'tracking/afk-model.ts',
      'tracking/doorbell-model.ts',
      'tracking/outbound-arrow-context.ts',
      'tracking/pilot-path.ts',
      'tracking/presence-context.ts',
      'tracking/presence-model.ts',
      'windows/MapWindow.tsx',
      'windows/MapWindowLayer.tsx',
      'windows/MapWindowLeader.tsx',
      'windows/SystemIntelligenceBody.tsx',
      'windows/follower-model.ts',
      'windows/node-fields.ts',
      'windows/window-model.ts',
    ]);
  });

  it('keeps internalized tombstone helpers off every UI surface', () => {
    // SC-5.2: public destruction/restore is sever + restoreSeveredBranch +
    // restoreConnection; the .1 single-row tombstone helpers stay internal.
    for (const file of mapperFiles()) {
      if (file === 'chain/optimistic-authoring.ts') continue;
      const source = sourceOf(file);
      expect(source, file).not.toContain('tombstoneSystem');
      expect(source, file).not.toContain('tombstoneConnection');
      expect(source, file).not.toContain('restoreSystem');
    }
  });

  it('routes UI destruction only through sever and the public restore pair', () => {
    const allowed = new Set([
      'chain/optimistic-authoring.ts',
      'authoring/ConnectionAuthoringOverlay.tsx',
    ]);
    for (const file of mapperFiles()) {
      const source = sourceOf(file);
      const namesDestruction =
        source.includes('severConnection') ||
        source.includes('restoreSeveredBranch') ||
        source.includes('restoreConnection');
      if (!namesDestruction) continue;
      expect(allowed.has(file), file).toBe(true);
    }
    const overlay = sourceOf('authoring/ConnectionAuthoringOverlay.tsx');
    expect(overlay).toContain('severConnection');
    expect(overlay).toContain('restoreSeveredBranch');
    expect(overlay).toContain('restoreConnection');
  });

  it('keeps the window layer off the hot nodes array', () => {
    // PD-4: selection/title come from equality-stable store selectors so
    // position-only drag frames cannot re-render hosted window content.
    const layer = sourceOf('windows/MapWindowLayer.tsx');
    const host = sourceOf('chain/ChainHost.tsx');
    expect(layer).not.toMatch(/readonly nodes:/);
    expect(layer).toContain('useSelectedSystemIds');
    expect(layer).toContain('useNodeName');
    expect(host).not.toMatch(/MapWindowLayer[\s\S]*nodes=\{nodes\}/);
  });

  it('imports no Convex package directly — the data slice owns the client', () => {
    const readers = mapperFiles().filter((file) =>
      sourceOf(file).includes("from 'convex/"),
    );

    expect(readers).toEqual([]);
  });

  it('routes paginated chain and signature reads through their separate slice seams', () => {
    const consumers = mapperFiles().filter((file) =>
      sourceOf(file).includes('@/data/convex/use-drained-pages'),
    );

    expect(consumers).toEqual([
      'chain/use-map-chain.ts',
      'signatures/SignatureProvider.tsx',
    ]);
    expect(sourceOf('chain/use-map-chain.ts')).not.toContain(
      'api.mapScan.watchMapSignatures',
    );
    expect(sourceOf('signatures/SignatureProvider.tsx')).toContain(
      'api.mapScan.watchMapSignatures',
    );
  });

  it('keeps the page subscriptions split so a connection write cannot re-read systems', () => {
    // HC-2's client half: one call per function over disjoint index ranges,
    // never one aggregate read. The unresolved-slot feed is the third split.
    const hook = sourceOf('chain/use-map-chain.ts');

    expect(hook).toContain('api.mapChain.watchMapSystems');
    expect(hook).toContain('api.mapChain.watchMapConnections');
    expect(hook).toContain('api.mapChain.watchUnresolvedHoles');
    expect((hook.match(/useDrainedPages\(/g) ?? []).length).toBe(3);
  });

  it('subscribes to the bounded map ledger and memoizes normalized chain pages', () => {
    const hook = sourceOf('chain/use-map-chain.ts');
    expect(hook).toContain('api.mapChain.watchMapEvents');
    expect(hook).toContain('filterChainConnections');
    expect(hook).toMatch(/const systems = useMemo\(/);
    expect(hook).toMatch(/const connections = useMemo\(/);
  });

  it('confines client-callable mutations to the three named mapper seams', () => {
    // Authoring, signatures, and tracking are independent mutation owners; all reach
    // Convex only through the data-slice re-export — never raw convex/react.
    const mutationFiles = mapperFiles().filter((file) =>
      /useMutation|useAction/.test(sourceOf(file)),
    );
    expect(mutationFiles).toEqual([
      'chain/optimistic-authoring.ts',
      'signatures/SignatureProvider.tsx',
      'tracking/TrackingControls.tsx',
    ]);
    for (const file of mutationFiles) {
      expect(sourceOf(file)).toContain('@/data/convex/use-mutation');
      expect(sourceOf(file)).not.toContain("from 'convex/react'");
    }
  });

  it('keeps canvas modules off every Convex subscription hook', () => {
    for (const file of mapperFiles().filter((name) => name.startsWith('canvas/'))) {
      const source = sourceOf(file);
      expect(source, `${file} must not read Convex`).not.toContain("from 'convex/react'");
      expect(source, `${file} must not read the chain hook`).not.toContain('use-map-chain');
      expect(source, `${file} must not build state from pages`).not.toContain(
        'usePaginatedQuery',
      );
      // Any live-data slice hook, not only today's two: the canvas renders what it is handed.
      // `@/data/convex/client` stays allowed — the null-client gate is a client-existence check,
      // not a subscription.
      expect(source, `${file} must not subscribe through a slice hook`).not.toMatch(
        /@\/data\/convex\/use-[\w-]+/,
      );
    }
  });

  it('introduces no server-side Convex read for the map route', () => {
    // HC-3: the client subscribes directly and the route stays static.
    for (const file of mapperFiles()) {
      expect(sourceOf(file)).not.toMatch(/preloadQuery|fetchQuery/);
    }
  });
});
