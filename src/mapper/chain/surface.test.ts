import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('mapper source contract', () => {
  const ROOT = 'src/mapper';

  function mapperFiles(): string[] {
    return readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
      .filter(
        (name) =>
          /\.tsx?$/.test(name) &&
          !name.includes('.test.') &&
          !name.includes('__tests__/'),
      )
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
      'authoring/HomePrompt.tsx',
      'authoring/MapAuthoringOverlay.tsx',
      'authoring/NodeAddMenu.tsx',
      'authoring/RightsTransitionToast.tsx',
      'authoring/connection-editor-mode.ts',
      'authoring/connection-field-group.tsx',
      'authoring/connection-field-setters.ts',
      'authoring/connection-fields.tsx',
      'authoring/connection-intelligence.ts',
      'authoring/home-prompt-model.ts',
      'authoring/leads-to-origin.ts',
      'authoring/rights-transition.ts',
      'authoring/sever-toast.ts',
      'authoring/use-wormhole-editor-data.ts',
      'authoring/wormhole-type-search.ts',
      'canvas/ChainLinkEdge.tsx',
      'canvas/ChainSurface.tsx',
      'canvas/EdgeContextMenu.tsx',
      'canvas/MapCanvas.tsx',
      'canvas/MapControls.tsx',
      'canvas/PilotPresenceBadge.tsx',
      'canvas/SystemNode.tsx',
      'canvas/camera-follow-model.ts',
      'canvas/edge-geometry.ts',
      'canvas/edge-menu.ts',
      'canvas/map-controls-model.ts',
      'canvas/use-camera-follow.ts',
      'chain/ChainHost.tsx',
      'chain/ChainLive.tsx',
      'chain/MotionLayer.tsx',
      'chain/NoMapAccess.tsx',
      'chain/chain-signature.ts',
      'chain/connection-detail.ts',
      'chain/intents.ts',
      'chain/labels.ts',
      'chain/nodes.ts',
      'chain/optimistic-authoring.ts',
      'chain/placement.ts',
      'chain/reconciler.ts',
      'chain/stub-layout.ts',
      'chain/use-authoring-menus.ts',
      'chain/use-chain-dials.ts',
      'chain/use-chain-drag.ts',
      'chain/use-chain-focus-menus.ts',
      'chain/use-chain-node-sync.ts',
      'chain/use-map-chain-halo.ts',
      'chain/use-map-chain-merge.ts',
      'chain/use-map-chain-pages.ts',
      'chain/use-map-chain.ts',
      'chain/use-universe-assets.ts',
      'fog/FogLayer.tsx',
      'fog/fog-host.ts',
      'fog/fog-model.ts',
      'fog/fog-painter.ts',
      'halo/halo-model.ts',
      'index.ts',
      'jump-client.ts',
      'layout/compass.ts',
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
      'signatures/ActiveScannerPanel.tsx',
      'signatures/ActiveSignatureEditor.tsx',
      'signatures/ActiveSiteViewer.tsx',
      'signatures/ScannerAnchoredPanel.tsx',
      'signatures/SignatureEditor.tsx',
      'signatures/SignatureJumpPrompt.tsx',
      'signatures/SignatureProvider.tsx',
      'signatures/SignatureWindow.tsx',
      'signatures/connection-authoring-api.ts',
      'signatures/editor-leader.ts',
      'signatures/jump-resolution.ts',
      'signatures/origin-leads.ts',
      'signatures/scanner-combo-panel.tsx',
      'signatures/scanner-field-class.ts',
      'signatures/scanner-identify-combo.tsx',
      'signatures/scanner-leads-control.tsx',
      'signatures/scanner-life-select.tsx',
      'signatures/scanner-mass-select.tsx',
      'signatures/scanner-panel-body.ts',
      'signatures/scanner-prompt-rail.tsx',
      'signatures/scanner-row-cells.tsx',
      'signatures/scanner-row-open.ts',
      'signatures/scanner-scroll-dismiss.tsx',
      'signatures/scanner-section-table.tsx',
      'signatures/scanner-type-combo.tsx',
      'signatures/scanner-window-frame.tsx',
      'signatures/scanner-wormhole-cells.tsx',
      'signatures/signature-context.tsx',
      'signatures/signature-elimination-client.ts',
      'signatures/signature-model.ts',
      'signatures/signature-toast.ts',
      'signatures/system-readout.ts',
      'signatures/use-identify-signature.ts',
      'signatures/use-scanner-paste.ts',
      'signatures/use-signature-jump-flow.ts',
      'signatures/use-signature-missing-flow.ts',
      'signatures/use-signature-page.ts',
      'signatures/use-signature-panel.ts',
      'signatures/use-system-statics.ts',
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
      'tracking/tracked-system.ts',
      'tracking/use-map-coverage.ts',
      'tracking/use-tracked-system.ts',
      'windows/MapWindow.tsx',
      'windows/MapWindowLayer.tsx',
      'windows/MapWindowLeader.tsx',
      'windows/SystemIntelligenceBody.tsx',
      'windows/follower-model.ts',
      'windows/use-system-label.ts',
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
    // One mutation owner, one dispatcher owner, one ledger. Every UI entry
    // point (editor Delete, edge-menu Delete) reaches destruction through
    // `connectionLifecycleActions`, never by naming the mutations itself.
    const allowed = new Set([
      'chain/optimistic-authoring.ts',
      'signatures/connection-authoring-api.ts',
      'authoring/MapAuthoringOverlay.tsx',
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
    const api = sourceOf('signatures/connection-authoring-api.ts');
    expect(api).toContain('severConnection');
    expect(api).toContain('restoreSeveredBranch');
    expect(api).toContain('restoreConnection');
  });

  it('keeps the window layer off the hot nodes array', () => {
    // PD-4: selection stays on an equality-stable store selector so
    // position-only drag frames cannot re-render hosted window content.
    // Titles come from the session directory, not node data, so off-map
    // k-space still names.
    const layer = sourceOf('windows/MapWindowLayer.tsx');
    const host = sourceOf('chain/ChainLive.tsx');
    expect(layer).not.toMatch(/readonly nodes:/);
    expect(layer).toContain('useSelectedSystemIds');
    expect(layer).toContain('useSystemLabel');
    expect(host).not.toMatch(/MapWindowLayer[\s\S]*nodes=\{nodes\}/);
  });

  it('stacks the node info card above the scanner sibling layer', () => {
    // MapWindowLayer and SignatureWindow are equal-band siblings; later DOM
    // order used to paint the scanner over the summary card. The card layer
    // owns z-float (20) so it wins without raising inner --map-window-z.
    expect(sourceOf('windows/MapWindowLayer.tsx')).toContain('z-float');
    expect(sourceOf('signatures/SignatureWindow.tsx')).toContain(
      'data-signature-window-layer',
    );
    expect(sourceOf('signatures/SignatureWindow.tsx')).toContain('z-sticky');
    expect(sourceOf('signatures/ScannerAnchoredPanel.tsx')).toContain(
      'z-sticky',
    );
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
      'chain/use-map-chain-pages.ts',
      'signatures/use-signature-page.ts',
    ]);
    expect(sourceOf('chain/use-map-chain-pages.ts')).not.toContain(
      'api.mapScan.watchMapSignatures',
    );
    expect(sourceOf('signatures/use-signature-page.ts')).toContain(
      'api.mapScan.watchMapSignatures',
    );
  });

  it('keeps the page subscriptions split so a connection write cannot re-read systems', () => {
    // HC-2's client half: one call per function over disjoint index ranges,
    // never one aggregate read. The unresolved-slot feed is the third split.
    const hook = sourceOf('chain/use-map-chain-pages.ts');

    expect(hook).toContain('api.mapChainSystems.watchMapSystems');
    expect(hook).toContain('api.mapChainConnections.watchMapConnections');
    expect(hook).toContain('api.mapChainConnections.watchUnresolvedHoles');
    expect((hook.match(/useDrainedPages\(/g) ?? []).length).toBe(3);
  });

  it('subscribes to the bounded map ledger and memoizes normalized chain pages', () => {
    const hook = sourceOf('chain/use-map-chain-pages.ts');
    expect(hook).toContain('api.mapChainEvents.watchMapEvents');
    expect(hook).toContain('const connections = subscribedConnections');
    expect(hook).toMatch(/const systems = useMemo\(/);
  });

  it('confines client-callable mutations to the three named mapper seams', () => {
    // Authoring, signatures, and tracking are independent mutation owners; all reach
    // Convex only through the data-slice re-export — never raw convex/react.
    const mutationFiles = mapperFiles().filter((file) =>
      /useMutation|useAction/.test(sourceOf(file)),
    );
    expect(mutationFiles).toEqual([
      'chain/optimistic-authoring.ts',
      'signatures/use-identify-signature.ts',
      'signatures/use-signature-missing-flow.ts',
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
