import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import { blankDoor } from '@/data/maps/connection-hallway';
import { setSiteNameIndex } from '@/features/wormhole-sites/site-name-lookup';
import { connectionEditorFixture } from '../chain/__tests__/connection-editor-fixture';
import {
  SignatureWindow,
  scannerLeadsCellKey,
  scannerTypeCellKey,
} from './SignatureWindow';
import type { ConnectionFieldSetters } from '../authoring/connection-fields';
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

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: React.ReactNode }) => children,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children?: React.ReactNode }) =>
    createElement('button', props, children),
}));

vi.mock('../authoring/use-wormhole-editor-data', () => ({
  useWormholeEditorData: () => ({
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
    preferredCodes: ['B274'],
    entry: null,
    codexReady: true,
  }),
}));

vi.mock('../chain/use-universe-assets', () => ({
  useUniverseAssets: () => null,
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
    connection: connectionEditorFixture({
      connectionId: 'connection-1' as Id<'mapConnections'>,
      _creationTime: 2_000,
      fromSystemId: 1,
      toSystemId: null,
      from: { ...blankDoor(), typeCode: 'B274', signatureId: 'WHL-001', signalPct: 100 },
      to: { ...blankDoor(), typeCode: 'K162' },
      identity: { kind: 'typed', provenance: 'human' },
      shipSize: 'M',
      firstSeenAt: 0,
    }),
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
  options: {
    readonly rows?: readonly SignatureWindowRow[];
    readonly complete?: boolean;
  } = {},
): string {
  return renderToStaticMarkup(
    createElement(SignatureWindow, {
      scannerSystemId,
      rows: options.rows ?? ROWS,
      missingIds,
      missingCount,
      canEdit: true,
      complete: options.complete ?? true,
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
  it('renders sectioned Signatures chrome and the empty, complete-empty, and unread shells', () => {
    const html = render(1, new Set());
    expect(html).toContain('data-map-window="signatures"');
    expect(html).toContain('data-map-window-placement="docked-bottom-left"');
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
    expect(html).toContain('Type');
    expect(html).toContain('data-signature-site-type="Gas"');
    expect(html).toContain('data-signature-site-type="Data"');
    expect(html).toContain('Mass');
    expect(html).toContain('Life');
    expect(html).toContain('Destination');
    expect(html).not.toContain('>Leads<');
    // The typed code's destination class stays on the wormhole row.
    expect(html).toContain('data-signature-class');
    expect(html).toContain('>HS<');
    expect(html).toContain('Est. ISK');
    expect(html).not.toContain('>Age<');
    expect(html).toContain('Age ');
    expect(html).not.toContain('tabindex="0"');
    expect(html).not.toContain('>Size<');
    expect(html).not.toContain('>Lifetime<');
    expect(html).not.toContain('data-signature-row-open');
    expect(html).not.toContain('Identify signature');
    expect(html).not.toContain('Identification is permanent');
    expect(html).toContain('placeholder="Unresolved"');
    expect(html).toContain('data-signature-isk="empty"');
    expect(html).toContain('data-signature-signal-fill');
    expect(html).toContain('scroll-area scroll-area-start');
    expect(html).not.toContain('>Group<');
    expect(html).toContain('>Signatures · Anomalies<');
    expect(html).toContain('data-scanner-dock-stack');
    expect(html).toContain('data-scanner-filled="true"');
    expect(html).not.toContain('[scrollbar-gutter:auto]');
    expect(html).toContain('data-scanner-scroll');
    expect(html).toContain('data-scanner-scroll-frost="start"');
    expect(html).toContain('data-scanner-scroll-frost="end"');
    expect(html).not.toContain('Track an online character');

    const empty = render(null, new Set());
    expect(empty).toContain('data-map-window="signatures"');
    expect(empty).toContain('data-scanner-dock-stack');
    expect(empty).toContain('data-scanner-filled="false"');
    expect(empty).toContain('data-scanner-paste-hint');
    expect(empty).toContain('Paste signatures anywhere on the page.');
    expect(empty).not.toContain('data-signature-id="ABC-123"');
    expect(empty).not.toContain('data-scanner-section=');
    expect(empty).not.toContain('No scanner rows in this system.');
    expect(empty).not.toContain('data-signature-empty');

    const completeEmpty = render(1, new Set(), 0, null, {
      rows: [],
      complete: true,
    });
    expect(completeEmpty).toContain('data-scanner-filled="false"');
    expect(completeEmpty).toContain('data-scanner-paste-hint');
    expect(completeEmpty).toContain('Paste signatures anywhere on the page.');
    expect(completeEmpty).not.toContain('Reading scanner rows…');
    expect(completeEmpty).not.toContain('data-scanner-sections');

    const loading = render(1, new Set(), 0, null, {
      rows: [],
      complete: false,
    });
    expect(loading).toContain('data-signature-empty');
    expect(loading).toContain('Reading scanner rows…');
    expect(loading).not.toContain('data-scanner-paste-hint');
    expect(loading).not.toContain('No scanner rows in this system.');
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

  it('keeps Type and Destination remount keys distinct when both values are empty', () => {
    const connectionId = 'm577478djxw0qbjjh9dcntqabn8c965j';
    expect(scannerTypeCellKey(connectionId, null)).toBe(
      `type:${connectionId}:`,
    );
    expect(scannerLeadsCellKey(connectionId, undefined, null)).toBe(
      `leads:${connectionId}:`,
    );
    expect(scannerTypeCellKey(connectionId, null)).not.toBe(
      scannerLeadsCellKey(connectionId, undefined, null),
    );
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
    expect(html).toContain('data-scanner-dock-stack');
    expect(html).toContain('data-scanner-prompt-rail');
    expect(html).toContain('data-signature-missing-prompt');
    expect(html).toContain('data-signature-jump-prompt');
    expect(html).toContain('Which signature did you jump through?');
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
      { id: 33, name: 'Unsecured Frontier', estIsk: 4_200_000 },
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
    // Catalogue-matched names (gas, combat, and data) open the read-only site
    // viewer; wormholes stay inert for a viewer. Action verb is an sr-only
    // prefix so ID / name / Est. ISK stay in the accessible name.
    expect(html.match(/sr-only">View site /g)?.length).toBe(3);
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
    expect(html).not.toContain('aria-label="View site');
    expect(html).toContain('Mass WHL-001');
    expect(html).not.toContain('sr-only">Edit wormhole ');
  });

  it('keeps wormhole scanner cells editable after a destination is set, including the far side', () => {
    const setters: ConnectionFieldSetters = {
      setWormholeType: vi.fn(),
      setShipSize: vi.fn(),
      setMassState: vi.fn(),
      setLifeStage: vi.fn(),
      setLeadsTo: vi.fn(),
      setDestination: vi.fn(),
      linkToOrigin: vi.fn(),
    };
    const origin = ROWS.find((row) => row.signatureId === 'WHL-001');
    expect(origin?.connection).toBeTruthy();
    const connection = {
      ...origin!.connection!,
      toSystemId: 2,
      to: { ...origin!.connection!.to, signatureId: 'FAR-001' },
    };
    const originRow: SignatureWindowRow = {
      ...origin!,
      connection,
    };
    const farSideRow: SignatureWindowRow = {
      key: 'connection:connection-1:to',
      systemId: 2,
      signatureId: 'FAR-001',
      kind: 'signature',
      group: 'Wormhole',
      name: 'K162',
      signalPct: null,
      firstSeenAt: 0,
      connection,
      className: null,
      endpoint: 'to',
    };
    const props = {
      missingIds: new Set<string>(),
      missingCount: 0,
      canEdit: true,
      complete: true,
      now: 60_000,
      onDismissMissing: vi.fn(),
      onRemoveMissing: vi.fn(async () => undefined),
      jumpResolution: null,
      onPickJumpCandidate: vi.fn(),
      onIdentify: vi.fn(async () => undefined),
      onOpenEditor: vi.fn(),
      onOpenSite: vi.fn(),
      bindConnectionSetters: () => setters,
    };
    const originHtml = renderToStaticMarkup(
      createElement(SignatureWindow, {
        ...props,
        scannerSystemId: 1,
        rows: [originRow],
      }),
    );
    expect(originHtml).toContain('aria-label="Type WHL-001"');
    expect(originHtml).toContain('aria-label="Mass WHL-001"');
    expect(originHtml).toContain('aria-label="Reliable Lifetime WHL-001"');
    expect(originHtml).toContain('aria-label="Destination WHL-001"');
    expect(originHtml).not.toContain('sr-only">Mass WHL-001');

    const farHtml = renderToStaticMarkup(
      createElement(SignatureWindow, {
        ...props,
        scannerSystemId: 2,
        rows: [farSideRow],
      }),
    );
    expect(farHtml).toContain('aria-label="Type FAR-001"');
    expect(farHtml).toContain('aria-label="Mass FAR-001"');
    expect(farHtml).toContain('aria-label="Reliable Lifetime FAR-001"');
    expect(farHtml).toContain('aria-label="Destination FAR-001"');
    expect(farHtml).not.toContain('sr-only">Mass FAR-001');
    expect(originHtml).toContain('value="2"');
    expect(farHtml).toContain('value="1"');
  });
});
