import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SignatureWindow } from './SignatureWindow';
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

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: (props: { open: boolean; confirmLabel: string }) =>
    createElement('div', {
      'data-confirm-dialog': '',
      'data-open': String(props.open),
      'data-confirm-label': props.confirmLabel,
    }),
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

vi.mock('./WormholeRowEditor', () => ({ WormholeRowEditor: () => null }));

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

function render(activeSystemId: number | null, missingIds: ReadonlySet<string>): string {
  return renderToStaticMarkup(
    createElement(SignatureWindow, {
      activeSystemId,
      rows: ROWS,
      missingIds,
      canEdit: true,
      complete: true,
      now: 60_000,
      onDismissMissing: vi.fn(),
      onRemove: vi.fn(async () => undefined),
      onIdentify: vi.fn(async () => undefined),
      mapId: 'map-a',
      authoring: {
        setConnectionWormholeType: vi.fn(),
        setConnectionShipSize: vi.fn(),
        setConnectionMassState: vi.fn(),
        setConnectionLifeStage: vi.fn(),
        setConnectionDestinationHint: vi.fn(),
        setConnectionTypedSide: vi.fn(),
        severConnection: vi.fn(),
        restoreSeveredBranch: vi.fn(),
        restoreConnection: vi.fn(),
      },
    }),
  );
}

describe('SignatureWindow component confirmation and filter states', () => {
  it('renders counted tabs, ID/group/name columns, and the bottom-left primitive', () => {
    const html = render(1, new Set());
    expect(html).toContain('data-map-window="signatures"');
    expect(html).toContain('data-map-window-placement="docked-bottom-left"');
    expect(html).toContain('data-tabs-default="signature"');
    expect(html).toContain('Signatures');
    expect(html).toContain('Anomalies');
    expect(html).toContain('ABC-123');
    expect(html).toContain('Forgotten Frontier');
    expect(html).toContain('data-signature-signal-fill');
    expect(html).not.toContain('>Scanner<');
    expect(html).not.toContain('Track an online character');
  });

  it('highlights a missing row behind Remove/dismiss confirmation affordances', () => {
    const html = render(1, new Set(['ABC-123']));
    expect(html).toContain('data-signature-missing="true"');
    expect(html).toContain('Dismiss');
    expect(html).toContain('Remove');
    expect(html).toContain('data-confirm-dialog');
    expect(html).toContain('data-confirm-label="Remove"');
  });

  it('keeps the window when untracked without retargeting to a selected node', () => {
    const html = render(null, new Set());
    expect(html).toContain('data-map-window="signatures"');
    expect(html).toContain('Signatures');
    expect(html).toContain('Anomalies');
    expect(html).not.toContain('data-signature-id="ABC-123"');
    expect(html).not.toContain('Track an online character');
  });
});
