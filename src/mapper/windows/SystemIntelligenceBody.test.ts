import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SystemIntelligenceBody } from './SystemIntelligenceBody';

vi.mock('@/components/use-entity-names', () => ({ useEntityNames: () => ({}) }));
vi.mock('../tracking/presence-context', () => ({ useSystemPresence: () => null }));
vi.mock('../signatures/signature-context', () => ({
  useSignatureCounts: () => ({ signatures: 3, anomalies: 2 }),
}));
vi.mock('./node-fields', () => ({
  useNodeDataString: (_systemId: number, field: string) =>
    field === 'name' ? 'J123456' : 'C5',
  useNodeDataNumber: (_systemId: number, field: string) =>
    field === 'security' ? -1 : 5,
}));

describe('SystemIntelligenceBody', () => {
  it('deduplicates the dock title while retaining security and scanner summary', () => {
    const dock = renderToStaticMarkup(
      createElement(SystemIntelligenceBody, { systemId: 1, mode: 'dock' }),
    );
    expect(dock).not.toContain('data-intel-identity');
    expect(dock).toContain('Security Status');
    expect(dock).toContain('Wormhole');
    expect(dock).toContain('3 signatures · 2 anomalies');
  });

  it('keeps the identity line in the selected-system card', () => {
    const summary = renderToStaticMarkup(
      createElement(SystemIntelligenceBody, { systemId: 1, mode: 'summary' }),
    );
    expect(summary).toContain('data-intel-identity');
    expect(summary).toContain('J123456');
    expect(summary).toContain('C5');
  });
});
