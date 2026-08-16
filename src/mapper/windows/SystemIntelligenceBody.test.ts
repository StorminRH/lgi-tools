import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';
import {
  SystemIntelligenceBody,
  SystemTitleAccessory,
} from './SystemIntelligenceBody';

// Mutable fixture facts so each case drives the mocked directory lookup.
const fields = {
  name: 'J123456',
  security: -1 as number | null,
  whClassId: 5 as number | null,
};

const assets = vi.hoisted(() => ({
  systemInfo: vi.fn<(id: number) => SystemDirectoryEntry | null>(() => null),
}));

vi.mock('@/components/use-entity-names', () => ({ useEntityNames: () => ({}) }));
vi.mock('../tracking/presence-context', () => ({ useSystemPresence: () => null }));
vi.mock('../signatures/signature-context', () => ({
  useSignatureCounts: () => ({ signatures: 3, anomalies: 2 }),
}));
vi.mock('../chain/use-map-chain', () => ({
  useUniverseAssets: () => ({ systemInfo: assets.systemInfo }),
}));

function directoryEntry(): SystemDirectoryEntry {
  return {
    id: 1,
    name: fields.name,
    security: fields.security,
    whClassId: fields.whClassId,
  };
}

function bodyMarkup(): string {
  return renderToStaticMarkup(createElement(SystemIntelligenceBody, { systemId: 1 }));
}

function titleAccessoryMarkup(): string {
  return renderToStaticMarkup(createElement(SystemTitleAccessory, { systemId: 1 }));
}

describe('SystemIntelligenceBody', () => {
  it('renders class or security as a title accessory and omits it until data resolves', () => {
    assets.systemInfo.mockImplementation(() => directoryEntry());
    Object.assign(fields, { name: 'J123456', security: -1, whClassId: 5 });

    const accessory = titleAccessoryMarkup();
    expect(accessory).toContain('data-identity-readout');
    expect(accessory).toContain('data-identity-classification');
    expect(accessory).toContain('>C5<');
    expect(accessory).toContain('text-wh-c5');
    expect(accessory).not.toContain(' — ');
    expect(accessory).not.toContain('J123456');

    const body = bodyMarkup();
    expect(body).not.toContain('data-identity-readout');
    expect(body).not.toContain('J123456');
    expect(body).not.toContain('Security Status');
    expect(body).not.toContain('-1.0');
    expect(body).toContain('3 signatures · 2 anomalies');

    Object.assign(fields, { name: 'Jita', security: 0.946, whClassId: null });
    const kspace = titleAccessoryMarkup();
    expect(kspace).toContain('>0.9<');
    expect(kspace).toContain('text-sec-09');
    expect(kspace).not.toContain('Jita');

    Object.assign(fields, { name: '30000142', security: null, whClassId: null });
    expect(titleAccessoryMarkup()).toBe('');

    assets.systemInfo.mockReturnValue(null);
    expect(titleAccessoryMarkup()).toBe('');
  });
});
