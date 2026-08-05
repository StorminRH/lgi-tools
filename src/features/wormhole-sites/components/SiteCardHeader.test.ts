import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SiteDetail } from '../types';
import { SiteCardHeader } from './SiteCardHeader';

vi.mock('@/components/ui/pill', () => ({
  Pill: ({ children }: { children?: unknown }) =>
    createElement('span', { 'data-pill': '' }, children as never),
}));

vi.mock('./SiteResourcesLive', () => ({
  SiteHeaderTotal: () => createElement('span', { 'data-site-header-total': '' }),
}));

vi.mock('./SiteShipClasses', () => ({
  SiteShipClasses: () => createElement('div', { 'data-site-ship-classes': '' }),
}));

const site = (over: Partial<SiteDetail> = {}): SiteDetail => ({
  id: 1,
  name: 'Forgotten Perimeter Coronation Platform',
  siteType: 'relic',
  wormholeClass: 'C1',
  signatureLabel: 'ABC-123',
  sourceTab: 'Sheet',
  blueLootIsk: 12_800_000,
  iskPerEhp: null,
  resourceValueIsk: null,
  waves: [],
  resources: [],
  ...over,
});

describe('SiteCardHeader', () => {
  it('renders the site name and ship-class slot for map-dock and catalogue aligns', () => {
    const dock = renderToStaticMarkup(
      createElement(SiteCardHeader, { site: site(), align: 'center' }),
    );
    const catalogue = renderToStaticMarkup(
      createElement(SiteCardHeader, { site: site(), align: 'start' }),
    );
    expect(dock).toContain('Forgotten Perimeter Coronation Platform');
    expect(dock).toContain('data-site-ship-classes');
    expect(catalogue).toContain('Forgotten Perimeter Coronation Platform');
    // The align split is this prop's entire behavior: dock embeds center,
    // catalogue cards must not.
    expect(dock).toContain('justify-center');
    expect(catalogue).not.toContain('justify-center');
  });
});
