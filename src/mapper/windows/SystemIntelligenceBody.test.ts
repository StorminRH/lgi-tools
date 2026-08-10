import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { systemIdentityReadout } from '@/data/eve-data/system-identity';
import { SystemIntelligenceBody } from './SystemIntelligenceBody';

// Mutable fixture facts so each case drives the mocked node-data selectors.
const fields = { name: 'J123456' as string | null, security: -1 as number | null, whClassId: 5 as number | null };

vi.mock('@/components/use-entity-names', () => ({ useEntityNames: () => ({}) }));
vi.mock('../tracking/presence-context', () => ({ useSystemPresence: () => null }));
vi.mock('../signatures/signature-context', () => ({
  useSignatureCounts: () => ({ signatures: 3, anomalies: 2 }),
}));
vi.mock('./node-fields', () => ({
  useNodeDataString: () => fields.name,
  useNodeDataNumber: (_systemId: number, field: string) =>
    field === 'whClassId' ? fields.whClassId : fields.security,
}));

function markup(): string {
  return renderToStaticMarkup(createElement(SystemIntelligenceBody, { systemId: 1 }));
}

describe('SystemIntelligenceBody', () => {
  it('renders the shared J-space identity readout and nothing else about security', () => {
    Object.assign(fields, { name: 'J123456', security: -1, whClassId: 5 });
    const readout = systemIdentityReadout({ name: 'J123456', security: -1, whClassId: 5 });
    expect(readout).toEqual({ label: 'J123456 - C5', tone: 'text-wh-c5' });

    const body = markup();
    expect(body).toContain('data-identity-readout');
    expect(body).toContain(readout.label);
    expect(body).toContain(readout.tone);
    // The readout carries the class; the old Security Status row is retired.
    expect(body).not.toContain('Security Status');
    expect(body).not.toContain('-1.0');
    expect(body).toContain('3 signatures · 2 anomalies');
  });

  it('renders the k-space readout through the same rule', () => {
    Object.assign(fields, { name: 'Jita', security: 0.946, whClassId: null });
    const readout = systemIdentityReadout({ name: 'Jita', security: 0.946, whClassId: null });
    expect(readout).toEqual({ label: 'Jita - 0.9', tone: 'text-sec-09' });

    const body = markup();
    expect(body).toContain(readout.label);
    expect(body).toContain(readout.tone);
  });

  it('falls back to the bare system id before node data resolves', () => {
    Object.assign(fields, { name: null, security: null, whClassId: null });
    const body = markup();
    expect(body).toContain('data-identity-readout');
    expect(body).toContain('>1<');
    expect(body).toContain('text-name');
  });
});
