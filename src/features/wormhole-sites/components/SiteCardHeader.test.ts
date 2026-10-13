import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { siteDetail } from '../__tests__/site-fixtures';
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

describe('SiteCardHeader', () => {
  it('renders the site name and ship-class slot for map-dock and catalogue aligns', () => {
    const site = siteDetail({
      name: 'Forgotten Perimeter Coronation Platform',
      siteType: 'relic',
      wormholeClass: 'C1',
      blueLootIsk: 12_800_000,
    });
    const dock = renderToStaticMarkup(
      createElement(SiteCardHeader, { site, align: 'center' }),
    );
    const catalogue = renderToStaticMarkup(
      createElement(SiteCardHeader, { site, align: 'start' }),
    );
    expect(dock).toContain('Forgotten Perimeter Coronation Platform');
    expect(dock).toContain('data-site-ship-classes');
    expect(catalogue).toContain('Forgotten Perimeter Coronation Platform');
    expect(dock).toContain('justify-center');
    expect(catalogue).not.toContain('justify-center');
  });
});
