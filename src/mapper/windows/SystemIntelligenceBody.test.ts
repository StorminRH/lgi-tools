import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  SystemIntelligenceBody,
  SystemTitleAccessory,
} from './SystemIntelligenceBody';

// Mutable fixture facts so each case drives the mocked node-data selectors.
const fields = {
  security: -1 as number | null,
  whClassId: 5 as number | null,
};

vi.mock('@/components/use-entity-names', () => ({ useEntityNames: () => ({}) }));
vi.mock('../tracking/presence-context', () => ({ useSystemPresence: () => null }));
vi.mock('../signatures/signature-context', () => ({
  useSignatureCounts: () => ({ signatures: 3, anomalies: 2 }),
}));
vi.mock('./node-fields', () => ({
  useNodeDataNumber: (_systemId: number, field: string) =>
    field === 'whClassId' ? fields.whClassId : fields.security,
}));

function bodyMarkup(): string {
  return renderToStaticMarkup(createElement(SystemIntelligenceBody, { systemId: 1 }));
}

function titleAccessoryMarkup(): string {
  return renderToStaticMarkup(createElement(SystemTitleAccessory, { systemId: 1 }));
}

describe('SystemIntelligenceBody', () => {
  it('renders class or security as a title accessory and omits it until data resolves', () => {
    Object.assign(fields, { security: -1, whClassId: 5 });

    const accessory = titleAccessoryMarkup();
    expect(accessory).toContain('data-identity-readout');
    expect(accessory).toContain('data-identity-classification');
    expect(accessory).toContain('>C5<');
    expect(accessory).toContain('text-wh-c5');
    expect(accessory).not.toContain('J123456');

    const body = bodyMarkup();
    expect(body).not.toContain('data-identity-readout');
    expect(body).not.toContain('J123456');
    expect(body).not.toContain('Security Status');
    expect(body).not.toContain('-1.0');
    expect(body).toContain('3 signatures · 2 anomalies');

    Object.assign(fields, { security: 0.946, whClassId: null });
    const kspace = titleAccessoryMarkup();
    expect(kspace).toContain('>0.9<');
    expect(kspace).toContain('text-sec-09');
    expect(kspace).not.toContain('Jita');

    Object.assign(fields, { security: null, whClassId: null });
    expect(titleAccessoryMarkup()).toBe('');
  });
});
