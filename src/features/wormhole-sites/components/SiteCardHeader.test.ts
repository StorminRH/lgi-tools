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
  it('centers the summary stack for map-dock embeds', () => {
    const markup = renderToStaticMarkup(
      createElement(SiteCardHeader, { site: site(), align: 'center' }),
    );
    expect(markup).toContain('Forgotten Perimeter Coronation Platform');
    expect(markup).toContain('items-center');
    expect(markup).toContain('justify-center');
    expect(markup).toContain('data-site-ship-classes');
  });

  it('keeps catalogue cards start-aligned', () => {
    const markup = renderToStaticMarkup(
      createElement(SiteCardHeader, { site: site(), align: 'start' }),
    );
    expect(markup).toContain('justify-between');
    expect(markup).not.toContain('justify-center');
  });
});
