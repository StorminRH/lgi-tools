import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDoor } from '@/data/maps/connection-hallway';
import type { ConnectionDetail, UnresolvedHoleSummary } from '../chain/connection-detail';
import { connectionEditorFixture } from '../chain/__tests__/connection-editor-fixture';
import { SignatureDataProvider, useSignatureCounts } from './signature-context';
import type { SignatureWindowRow } from './signature-model';
import { useSignaturePage } from './use-signature-page';

const SYSTEM = 31_000_001;
const paged = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/data/convex/use-drained-pages', () => ({
  useDrainedPages: (...args: unknown[]) => {
    paged.read(...args);
    return { rows: [], complete: false };
  },
}));
vi.mock('../authoring/use-wormhole-editor-data', () => ({
  useWormholeCodexData: () => ({ codex: null }),
}));

const resolved: ConnectionDetail = {
  ...connectionEditorFixture({
    fromSystemId: SYSTEM,
    from: { ...blankDoor(), signatureId: 'OUT-001' },
    to: { ...blankDoor(), signatureId: 'INC-001' },
  }),
  toSystemId: SYSTEM + 1,
};
const unresolved: UnresolvedHoleSummary = {
  ...connectionEditorFixture({
    fromSystemId: SYSTEM + 2,
    from: { ...blankDoor(), signatureId: 'GST-001' },
  }),
  toSystemId: null,
};
const connections = new Map([[resolved.connectionId, resolved]]);
const holes = [unresolved];
const scannerRows: readonly SignatureWindowRow[] = [{
  key: 'scanner', systemId: SYSTEM, signatureId: 'ANO-001', kind: 'anomaly',
  group: 'Combat Site', name: null, signalPct: 100, firstSeenAt: 1,
  connection: null, className: null,
}];

function PageProbe({ systemId }: { readonly systemId: number | null }) {
  const { rows, complete } = useSignaturePage('map-a', systemId, connections, holes);
  return createElement('output', null, JSON.stringify({ rows, complete }));
}

function CountProbe({ systemId }: { readonly systemId: number }) {
  const counts = useSignatureCounts(systemId);
  return createElement('output', null, `${counts.signatures}/${counts.anomalies}`);
}

function countMarkup(systemIds: readonly number[], scannerSystemId: number | null = SYSTEM) {
  return renderToStaticMarkup(createElement(SignatureDataProvider, {
    value: { mapId: 'map-a', scannerSystemId, scannerRows, connectionDetails: connections, unresolvedHoles: holes },
  }, systemIds.map((systemId) => createElement(CountProbe, { key: systemId, systemId }))));
}

describe('system-local signature pages', () => {
  beforeEach(() => paged.read.mockClear());

  it('skips the scanner read without a target and scopes a selected target', () => {
    const absent = renderToStaticMarkup(createElement(PageProbe, { systemId: null }));
    expect(paged.read.mock.calls[0]?.[1]).toBe('skip');
    expect(absent).toContain('&quot;complete&quot;:true');
    renderToStaticMarkup(createElement(PageProbe, { systemId: SYSTEM }));
    expect(paged.read.mock.calls[1]?.[1]).toEqual({ mapId: 'map-a', systemId: SYSTEM });
  });

  it('retains outgoing, incoming, and unresolved connection rows while signature reads are scoped', () => {
    const markup = renderToStaticMarkup(createElement(PageProbe, { systemId: SYSTEM }));
    expect(markup).toContain('OUT-001');
    expect(markup).toContain('INC-001');
    expect(markup).toContain('GST-001');
  });

  it('reuses scanner rows for its count and reads only other mounted summaries', () => {
    const markup = countMarkup([SYSTEM, SYSTEM + 1]);
    expect(paged.read.mock.calls.map((call) => call[1])).toEqual([
      'skip', { mapId: 'map-a', systemId: SYSTEM + 1 },
    ]);
    expect(markup).toContain('<output>0/1</output>');
    expect(markup).toContain('<output>1/0</output>');
  });

  it('reads mounted intelligence without a scanner and preserves ghost counts', () => {
    expect(countMarkup([SYSTEM + 2], null)).toContain('<output>1/0</output>');
    expect(paged.read.mock.calls.map((call) => call[1])).toEqual([
      { mapId: 'map-a', systemId: SYSTEM + 2 },
    ]);
  });
});
