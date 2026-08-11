import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import { SignatureWindow } from './SignatureWindow';
import type { JumpResolutionModel } from './jump-resolution';
import type { SignatureWindowRow } from './signature-model';

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
    }),
  );
}

describe('SignatureWindow component prompt and filter states', () => {
  it('renders sectioned Signatures, flat Anomalies, and bottom-left chrome', () => {
    const html = render(1, new Set());
    expect(html).toContain('data-map-window="signatures"');
    expect(html).toContain('data-map-window-placement="docked-bottom-left"');
    expect(html).toContain('data-tabs-default="signature"');
    expect(html).toContain('Signatures');
    expect(html).toContain('Anomalies');
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
    expect(html).toContain('ABC-123');
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
    expect(html).toContain('data-signature-isk-placeholder');
    expect(html).toContain('data-signature-signal-fill');
    expect(html).toContain('scroll-area');
    expect(html).not.toContain('>Group<');
    expect(html).not.toContain('>Scanner<');
    expect(html).not.toContain('Track an online character');
  });

  it('highlights missing rows and shows one bulk prompt above the scanner', () => {
    const html = render(1, new Set(['ABC-123']));
    expect(html).toContain('data-signature-missing="true"');
    expect(html).toContain('data-signature-missing-prompt');
    expect(html).toContain('1 signature missing from scan');
    expect(html).toContain('Dismiss');
    expect(html).toContain('Remove');
    expect(html).not.toContain('map-signature-missing-actions');
    expect(html).not.toContain('data-confirm-dialog');
  });

  it('pluralizes the bulk missing prompt for multiple IDs', () => {
    const html = render(1, new Set(['ABC-123', 'CBA-120']));
    expect(html).toContain('2 signatures missing from scan');
  });

  it('shows the prompt for a paste-target system the window does not list', () => {
    // The pilot pasted down the chain: the prompt follows the paste target
    // (missingCount) while row highlighting stays scoped to the listed system.
    const html = render(1, new Set(), 3);
    expect(html).toContain('data-signature-missing-prompt');
    expect(html).toContain('3 signatures missing from scan');
    expect(html).not.toContain('data-signature-missing="true"');
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

  it('shows root-system rows without a tracked online character', () => {
    const html = render(1, new Set());
    expect(html).toContain('data-map-window="signatures"');
    expect(html).toContain('Signatures');
    expect(html).toContain('Anomalies');
    expect(html).toContain('data-signature-id="ABC-123"');
    expect(html).not.toContain('Track an online character');
  });

  it('stays empty when the map has no chain root yet', () => {
    const html = render(null, new Set());
    expect(html).toContain('data-map-window="signatures"');
    expect(html).not.toContain('data-signature-id="ABC-123"');
    expect(html).not.toContain('data-scanner-section=');
  });
});
