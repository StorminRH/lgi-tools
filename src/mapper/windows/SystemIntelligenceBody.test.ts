import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';
import type { WormholeEffect } from '@/data/eve-data/wormhole-contract';
import type { SiteSearchEntry } from '@/features/wormhole-sites/queries';
import { SiteCatalogueProvider } from '@/features/wormhole-sites/site-catalogue';
import type { SignatureWindowRow } from '../signatures/signature-model';
import {
  SystemIntelligenceBody,
  SystemTitleAccessory,
} from './SystemIntelligenceBody';

const fields = {
  name: 'J123456',
  security: -1 as number | null,
  whClassId: 5 as number | null,
  effect: null as WormholeEffect | null,
};

const statics = vi.hoisted(() => ({ slots: [] as { code: string; className: string }[] }));

const signatures = vi.hoisted(() => ({ rows: [] as SignatureWindowRow[] }));
const refresh = vi.hoisted(() => vi.fn(() => ({
  prices: new Map([[30370, { bestSell: 30_000 }]]),
  isPending: () => false,
})));

vi.mock('@/data/market-prices/use-refresh-on-view', () => ({ useRefreshOnView: refresh }));

const assets = vi.hoisted(() => ({
  systemInfo: vi.fn<(id: number) => SystemDirectoryEntry | null>(() => null),
}));

vi.mock('@/components/use-entity-names', () => ({ useEntityNames: () => ({}) }));
vi.mock('../tracking/presence-context', () => ({ useSystemPresence: () => null }));
vi.mock('../signatures/signature-context', () => ({
  useSignatureRows: () => signatures.rows,
}));
vi.mock('../signatures/use-system-statics', () => ({ useSystemStaticSlots: () => statics.slots }));
vi.mock('../chain/use-universe-assets', () => ({
  useUniverseAssets: () => ({ systemInfo: assets.systemInfo }),
}));

function directoryEntry(): SystemDirectoryEntry {
  return {
    id: 1,
    name: fields.name,
    regionName: 'Test Region',
    security: fields.security,
    whClassId: fields.whClassId,
    effect: fields.effect,
  };
}

function bodyMarkup(siteIndex: readonly SiteSearchEntry[] = []): string {
  return renderToStaticMarkup(createElement(
    SiteCatalogueProvider,
    { siteIndex },
    createElement(SystemIntelligenceBody, { systemId: 1 }),
  ));
}

function siteRow(key: string, name: string | null, group: SignatureWindowRow['group'] = 'Combat Site'): SignatureWindowRow {
  return {
    key, name, group, systemId: 1, signatureId: key, kind: 'anomaly', signalPct: 100,
    firstSeenAt: 1, connection: null, className: null,
  };
}

const combatSite: SiteSearchEntry = {
  id: 1, name: 'Perimeter Ambush Point', siteType: 'combat', wormholeClass: 'C1',
  blueLootIsk: 8_600_000, resourceValueIsk: 99_000_000, liveRecipes: [],
};

afterEach(() => {
  signatures.rows = [];
  statics.slots = [];
  fields.effect = null;
  refresh.mockClear();
});

function titleAccessoryMarkup(): string {
  return renderToStaticMarkup(createElement(SystemTitleAccessory, { systemId: 1 }));
}

describe('SystemIntelligenceBody', () => {
  it('shows combat blue-loot totals for every site occurrence without requesting market prices', () => {
    signatures.rows = [siteRow('A', combatSite.name), siteRow('B', combatSite.name)];
    const body = bodyMarkup([combatSite]);
    expect(body).toContain('data-intel-category="combat"');
    expect(body).toContain('>17.2M<');
    expect(body).not.toContain('198.0M');
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([null, 'Unknown Combat Site'])('withholds the combat total when a site is unpriced: %s', (name) => {
    signatures.rows = [siteRow('A', combatSite.name), siteRow('B', name)];
    const body = bodyMarkup([combatSite]);
    expect(body).toContain('>—<');
    expect(body).not.toContain('>8.6M<');
  });

  it('keeps harvestable totals on live resource prices alongside combat blue loot', () => {
    const gas: SiteSearchEntry = {
      id: 49, name: 'Barren Perimeter Reservoir', siteType: 'gas', wormholeClass: null,
      blueLootIsk: null, resourceValueIsk: 28_100_000,
      liveRecipes: [{ typeId: 30370, units: 1_000, seedIsk: 28_100_000 }],
    };
    signatures.rows = [siteRow('A', combatSite.name), siteRow('B', gas.name, 'Gas Site')];
    const body = bodyMarkup([combatSite, gas]);
    expect(body).toContain('>8.6M<');
    expect(body).toContain('>30.0M<');
    expect(refresh).toHaveBeenCalledWith([30370], { enabled: true });
  });

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
    expect(body).toContain('0 signatures · 0 anomalies');

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

  it('lists the wormhole effect with its icon below the statics, with or without statics', () => {
    assets.systemInfo.mockImplementation(() => directoryEntry());
    Object.assign(fields, { name: 'J123456', security: -1, whClassId: 5, effect: 'cataclysmic-variable' });
    statics.slots = [{ code: 'D792', className: 'HS' }];

    const withStatics = bodyMarkup();
    expect(withStatics).toContain('data-intel-statics');
    expect(withStatics).toContain('aria-label="Effect"');
    expect(withStatics).toContain('text-effect-cataclysmic-variable');
    expect(withStatics).toContain('>Cataclysmic Variable<');
    expect(withStatics.indexOf('data-intel-statics')).toBeLessThan(withStatics.indexOf('data-intel-effect'));

    statics.slots = [];
    const effectOnly = bodyMarkup();
    expect(effectOnly).not.toContain('data-intel-statics');
    expect(effectOnly).toContain('>Cataclysmic Variable<');

    fields.effect = null;
    expect(bodyMarkup()).not.toContain('data-intel-effect');
  });
});
