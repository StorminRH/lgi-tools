import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';
import type { HubJumpTuple } from '@/data/eve-data/trade-hubs';
import type { SignatureWindowRow } from '../signatures/signature-model';
import {
  SystemIntelligenceBody,
  SystemTitleAccessory,
} from './SystemIntelligenceBody';

const fields = {
  name: 'J123456',
  security: -1 as number | null,
  whClassId: 5 as number | null,
};

const assets = vi.hoisted(() => ({
  systemInfo: vi.fn<(id: number) => SystemDirectoryEntry | null>(() => null),
  hubJumps: vi.fn<(id: number) => HubJumpTuple>(),
}));

const intel = vi.hoisted(() => ({
  rows: [] as SignatureWindowRow[],
  statics: [] as { code: string; className: string }[],
  isk: null as number | null,
  pilots: [] as {
    characterId: number;
    shipTypeId: number | null;
    docked: boolean;
    lastMovementAt: number;
  }[],
  names: {} as Record<string, string>,
  ships: {} as Record<string, string>,
}));

vi.mock('@/components/use-entity-names', () => ({
  useEntityNames: () => intel.names,
}));
vi.mock('@/data/eve-data/use-type-names', () => ({
  useTypeNames: () => intel.ships,
}));
vi.mock('../tracking/presence-context', () => ({
  useSystemPresence: () =>
    intel.pilots.length === 0 ? null : { pilots: intel.pilots },
}));
vi.mock('../signatures/signature-context', () => ({
  useSignatureRows: () => intel.rows,
}));
vi.mock('../signatures/use-system-statics', () => ({
  useSystemStaticSlots: () => intel.statics,
}));
vi.mock('@/features/wormhole-sites/widget', () => ({
  ScannerLivePricesProvider: ({
    children,
  }: {
    children?: unknown;
  }) => children ?? null,
  useScannerEstIskSum: () => intel.isk,
}));
vi.mock('../chain/use-universe-assets', () => ({
  useUniverseAssets: () => ({
    systemInfo: assets.systemInfo,
    hubJumps: assets.hubJumps,
  }),
}));

function directoryEntry(): SystemDirectoryEntry {
  return {
    id: 1,
    name: fields.name,
    regionName: 'A-R00001',
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
    intel.rows = [];
    intel.statics = [];
    intel.isk = null;
    intel.pilots = [];
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
    expect(body).not.toContain('signatures ·');

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

  it('lists wormhole statics, identified category totals, and friendly ship names', () => {
    Object.assign(fields, { name: 'J123456', security: -1, whClassId: 5 });
    assets.systemInfo.mockImplementation(() => directoryEntry());
    intel.statics = [{ code: 'C247', className: 'C3' }];
    intel.isk = 12_000_000;
    intel.rows = [{
      key: 'combat',
      systemId: 1,
      signatureId: 'ABC-001',
      kind: 'anomaly',
      group: 'Combat Site',
      name: 'Sansha Hideout',
      signalPct: null,
      firstSeenAt: 1,
      connection: null,
      className: null,
    }];
    intel.pilots = [{
      characterId: 7,
      shipTypeId: 1,
      docked: false,
      lastMovementAt: 0,
    }];
    intel.names = { '7': 'E2E Pilot' };
    intel.ships = { '1': 'Harbinger' };

    const body = bodyMarkup();
    expect(body).toContain('data-intel-statics');
    expect(body).toContain('C247 C3');
    expect(body).toContain('Combat ×1');
    expect(body).toContain('12.0M');
    expect(body).not.toContain('Sansha Hideout');
    expect(body).toContain('E2E Pilot');
    expect(body).toContain('data-presence-ship');
    expect(body).toContain('Harbinger');
    expect(body).not.toContain('data-intel-hubs');
  });

  it('lists all five hubs on a security-chip system', () => {
    Object.assign(fields, { name: 'Jita', security: 0.946, whClassId: null });
    assets.systemInfo.mockImplementation(() => directoryEntry());
    assets.hubJumps.mockReturnValue([
      { id: 30_000_142, name: 'Jita', jumps: 0 },
      { id: 30_002_187, name: 'Amarr', jumps: 10 },
      { id: 30_002_659, name: 'Dodixie', jumps: 15 },
      { id: 30_002_510, name: 'Rens', jumps: 16 },
      { id: 30_002_053, name: 'Hek', jumps: null },
    ]);
    intel.rows = [];
    intel.statics = [{ code: 'C247', className: 'C3' }];
    intel.pilots = [];

    const body = bodyMarkup();
    expect(body).toContain('data-intel-hubs');
    expect(body).toContain('Jita 0');
    expect(body).toContain('Hek —');
    expect(body).not.toContain('data-intel-statics');
  });
});
