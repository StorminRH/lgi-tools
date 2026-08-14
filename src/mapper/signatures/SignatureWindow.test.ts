import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import { setSiteNameIndex } from '@/features/wormhole-sites/site-name-lookup';
import { SignatureWindow } from './SignatureWindow';
import type { JumpResolutionModel } from './jump-resolution';
import type { SignatureWindowRow } from './signature-model';

vi.mock('@/data/market-prices/use-refresh-on-view', () => ({
  useRefreshOnView: () => ({
    prices: new Map(),
    isPending: () => false,
    refreshing: false,
  }),
}));

afterEach(() => {
  setSiteNameIndex([]);
});

vi.mock('@/components/ui/tabs', () => ({
  Tabs: (props: {
    defaultValue?: string;
    tabs: readonly { value: string; label: string; content: React.ReactNode }[];
  }) => createElement(
    'div',
    { 'data-tabs-default': props.defaultValue },
    props.tabs.map((tab) =>
      createElement('section', { key: tab.value, 'data-tab': tab.value }, tab.label, tab.content),
    ),
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children?: React.ReactNode }) =>
    createElement('button', props, children),
}));

vi.mock('@/components/ui/pointer-menu', () => ({
  PointerMenu: () => null,
  MenuItem: () => null,
  menuRow: '',
  pointerAnchor: () => null,
}));

vi.mock('../authoring/use-wormhole-editor-data', () => ({
  useWormholeCodexData: () => ({
    codex: {
      byCode: (code: string) =>
        code === 'B274'
          ? {
              code: 'B274',
              typeId: 1,
              farSide: false,
              totalMass: 2_000_000_000,
              maxJumpMass: 375_000_000,
              massRegen: 0,
              lifetimeMinutes: 960,
              sizeClass: 'L',
              targetClass: 7,
            }
          : null,
      codes: () => ['B274'],
    },
    codes: ['B274'],
    entry: null,
    codexReady: true,
  }),
}));

const ROWS: readonly SignatureWindowRow[] = [
  {
    key: 'sig-1',
    systemId: 1,
    signatureId: 'ABC-123',
    kind: 'signature',
    group: null,
    name: null,
    signalPct: 25,
    firstSeenAt: 0,
    connection: null,
    className: null,
  },
  {
    key: 'sig-combat',
    systemId: 1,
    signatureId: 'CBT-001',
    kind: 'signature',
    group: 'Combat Site',
    name: 'Sansha Hideout',
    signalPct: 100,
    firstSeenAt: 0,
    connection: null,
    className: null,
  },
  {
    key: 'sig-gas',
    systemId: 1,
    signatureId: 'GAS-001',
    kind: 'signature',
    group: 'Gas Site',
    name: 'Barren Perimeter Reservoir',
    signalPct: 100,
    firstSeenAt: 0,
    connection: null,
    className: null,
  },
  {
    key: 'sig-data',
    systemId: 1,
    signatureId: 'DAT-001',
    kind: 'signature',
    group: 'Data Site',
    name: 'Unsecured Frontier',
    signalPct: 100,
    firstSeenAt: 0,
    connection: null,
    className: null,
  },
  {
    key: 'sig-wh',
    systemId: 1,
    signatureId: 'WHL-001',
    kind: 'signature',
    group: 'Wormhole',
    name: 'B274',
    signalPct: 100,
    firstSeenAt: 0,
    connection: {
      connectionId: 'connection-1' as Id<'mapConnections'>,
      _creationTime: 2_000,
      fromSystemId: 1,
      toSystemId: null,
      fromSignatureId: 'WHL-001',
      toSignatureId: null,
      fromSignalPct: 100,
      firstSeenAt: 0,
      wormholeTypeCode: 'B274',
      typedSide: null,
      massState: null,
      shipSize: 'M',
      lifeStage: null,
      lifeStageObservedAt: null,
      deathEarliestAt: null,
      deathLatestAt: null,
      deletedAt: null,
      purgeAfter: null,
      fromDestinationHint: null,
      toDestinationHint: null,
      destinationProvenance: null,
      pendingCandidates: null,
    pendingResolutionCharacterId: null,
      observedMassKg: null,
      observedMassAtStateKg: null,
    },
    className: 'HS',
  },
  {
    key: 'sig-2',
    systemId: 1,
    signatureId: 'ANO-456',
    kind: 'anomaly',
    group: 'Combat Site',
    name: 'Forgotten Frontier',
    signalPct: 100,
    firstSeenAt: 0,
    connection: null,
    className: null,
  },
];

function render(
  scannerSystemId: number | null,
  missingIds: ReadonlySet<string>,
  missingCount = missingIds.size,
  jumpResolution: JumpResolutionModel | null = null,
): string {
  return renderToStaticMarkup(
    createElement(SignatureWindow, {
      scannerSystemId,
      rows: ROWS,
      missingIds,
      missingCount,
      canEdit: true,
      complete: true,
      now: 60_000,
      onDismissMissing: vi.fn(),
      onRemoveMissing: vi.fn(async () => undefined),
      jumpResolution,
      onPickJumpCandidate: vi.fn(),
      onIdentify: vi.fn(async () => undefined),
      onOpenEditor: vi.fn(),
      onOpenSite: vi.fn(),
    }),
  );
}

describe('SignatureWindow component prompt and filter states', () => {
  it('renders sectioned Signatures chrome for the root system and stays empty without a root', () => {
    const html = render(1, new Set());
    expect(html).toContain('data-map-window="signatures"');
    expect(html).toContain('data-map-window-placement="docked-bottom-left"');
    expect(html).toContain('data-tabs-default="signature"');
    expect(html).toContain('Signatures');
    expect(html).toContain('Anomalies');
    expect(html).toContain('data-signature-id="ABC-123"');
    expect(html).toContain('data-scanner-section="unknown"');
    expect(html).toContain('data-scanner-section="wormholes"');
    expect(html).toContain('data-scanner-section="combat"');
    expect(html).toContain('data-scanner-section="harvestables"');
    expect(html).toContain('data-scanner-section="hacking"');
    expect(html).toContain('data-collapsible');
    expect(html).toContain('data-scanner-sections');
    expect(html).toContain('data-scanner-section-body');
    expect(html).toContain('Unknown');
    expect(html).toContain('Wormholes');
    expect(html).toContain('Combat');
    expect(html).toContain('Harvestables');
    expect(html).toContain('Hacking');
    expect(html).toContain('data-chevron');
    expect(html).toContain('Sansha Hideout');
    expect(html).toContain('Barren Perimeter Reservoir');
    expect(html).toContain('Unsecured Frontier');
    expect(html).toContain('Forgotten Frontier');
    expect(html).toContain('Size');
    expect(html).toContain('Lifetime');
    // The typed code's destination class stays on the wormhole row after the
    // Group column's retirement.
    expect(html).toContain('data-signature-class');
    expect(html).toContain('>HS<');
    expect(html).toContain('Est. ISK');
    expect(html).toContain('>L<');
    expect(html).toContain('≤ ');
    expect(html).not.toContain('Less than 4 hours');
    expect(html).toContain('data-signature-row-open');
    // Unmatched combat/harvestable names stay as the empty Est. ISK dash.
    expect(html).toContain('data-signature-isk="empty"');
    expect(html).toContain('data-signature-signal-fill');
    expect(html).toContain('scroll-area');
    expect(html).not.toContain('>Group<');
    expect(html).not.toContain('>Scanner<');
    // Root-system rows render without requiring a tracked online character.
    expect(html).not.toContain('Track an online character');

    const empty = render(null, new Set());
    expect(empty).toContain('data-map-window="signatures"');
    expect(empty).not.toContain('data-signature-id="ABC-123"');
    expect(empty).not.toContain('data-scanner-section=');
  });

  it('highlights missing rows, pluralizes the bulk prompt, and keys it to the paste target', () => {
    const singular = render(1, new Set(['ABC-123']));
    expect(singular).toContain('data-signature-missing="true"');
    expect(singular).toContain('data-signature-missing-prompt');
    expect(singular).toContain('1 signature missing from scan');
    expect(singular).toContain('Dismiss');
    expect(singular).toContain('Remove');
    expect(singular).not.toContain('map-signature-missing-actions');
    expect(singular).not.toContain('data-confirm-dialog');

    expect(render(1, new Set(['ABC-123', 'CBA-120']))).toContain(
      '2 signatures missing from scan',
    );

    // The pilot pasted down the chain: the prompt follows the paste target
    // (missingCount) while row highlighting stays scoped to the listed system.
    const remote = render(1, new Set(), 3);
    expect(remote).toContain('data-signature-missing-prompt');
    expect(remote).toContain('3 signatures missing from scan');
    expect(remote).not.toContain('data-signature-missing="true"');
  });

  it('stacks missing-scan and ambiguous-jump prompts in one scanner rail', () => {
    const jumpResolution: JumpResolutionModel = {
      connectionId: 'connection-1' as Id<'mapConnections'>,
      destination: { label: 'J123456 - C4', tone: 'text-wh-c4' },
      candidates: [
        {
          connectionId: 'connection-1' as Id<'mapConnections'>,
          signatureId: 'WHL-001',
          wormholeTypeCode: 'B274',
          isCurrent: true,
        },
        {
          connectionId: 'connection-2' as Id<'mapConnections'>,
          signatureId: 'XYZ-999',
          wormholeTypeCode: null,
          isCurrent: false,
        },
      ],
    };
    const html = render(1, new Set(['ABC-123']), 1, jumpResolution);
    expect(html).toContain('data-scanner-prompt-rail');
    expect(html).toContain('data-signature-missing-prompt');
    expect(html).toContain('data-signature-jump-prompt');
  });

  it('opens catalogue sites for viewers with live Est. ISK while combat stays static', () => {
    setSiteNameIndex([
      {
        id: 49,
        name: 'Barren Perimeter Reservoir',
        // Live-priced total (not the historical sheet 82.4M).
        estIsk: 28_100_000,
        liveRecipes: [{ typeId: 30370, units: 1_000, seedIsk: 28_100_000 }],
      },
      { id: 1, name: 'Sansha Hideout', estIsk: 12_000_000 },
    ]);
    const html = renderToStaticMarkup(
      createElement(SignatureWindow, {
        scannerSystemId: 1,
        rows: ROWS,
        missingIds: new Set<string>(),
        missingCount: 0,
        canEdit: false,
        complete: true,
        now: 60_000,
        onDismissMissing: vi.fn(),
        onRemoveMissing: vi.fn(async () => undefined),
        jumpResolution: null,
        onPickJumpCandidate: vi.fn(),
        onIdentify: vi.fn(async () => undefined),
        onOpenEditor: vi.fn(),
        onOpenSite: vi.fn(),
      }),
    );
    // Catalogue-matched names (gas and combat) open the read-only site viewer;
    // wormholes stay inert for a viewer. Action verb is an sr-only prefix so
    // ID / name / Est. ISK stay in the accessible name.
    expect(html.match(/sr-only">View site /g)?.length).toBe(2);
    expect(html).toContain('Barren Perimeter Reservoir');
    expect(html).toContain('Sansha Hideout');
    expect(html).toContain('data-signature-id="GAS-001"');
    expect(html).toContain('data-signature-id="CBT-001"');
    expect(html).toContain('data-signature-row-open');
    expect(html).toContain('data-signature-isk="value"');
    expect(html).toContain('28.1M');
    expect(html).toContain('12.0M');
    expect(html).toContain('data-price-state="settled"');
    // Combat headline is a plain span — only the harvestable cell uses LivePrice.
    expect(html.match(/data-price-state="/g)?.length).toBe(1);
    expect(html).not.toContain('aria-label=');
    expect(html).not.toContain('sr-only">Edit wormhole ');
  });
});
