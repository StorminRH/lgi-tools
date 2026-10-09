import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { siteDetail } from '../__tests__/site-fixtures';
import { SiteCard } from './SiteCard';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: unknown;
  }) => createElement('a', { href, ...rest }, children as never),
}));

vi.mock('@/components/ui/pill', () => ({
  Pill: ({ children }: { children?: unknown }) =>
    createElement('span', { 'data-pill': '' }, children as never),
}));

vi.mock('./SiteResourcesLive', () => ({
  SiteLiveProvider: ({ children }: { children?: unknown }) =>
    createElement('div', { 'data-site-live': '' }, children as never),
  SiteHeaderTotal: () => createElement('span', { 'data-site-header-total': '' }),
}));

vi.mock('./SiteShipClasses', () => ({
  SiteShipClasses: () => createElement('div', { 'data-site-ship-classes': '' }),
}));

vi.mock('./SiteDetailsBody', () => ({
  SiteDetailsBody: () => createElement('div', { 'data-site-details-body': '' }),
}));

vi.mock('./LazySiteDetails', () => ({
  LazySiteDetails: () => createElement('div', { 'data-lazy-site-details': '' }),
}));

vi.mock('./SiteCardLightbox', () => ({
  SiteCardLightbox: () => createElement('div', { 'data-site-card-lightbox': '' }),
}));

describe('SiteCard', () => {
  it('keeps catalogue collapse and extras; standalone is always expanded', () => {
    const site = siteDetail({
      name: 'Forgotten Perimeter Coronation Platform',
      siteType: 'relic',
      wormholeClass: 'C1',
      blueLootIsk: 12_800_000,
    });
    const catalogue = renderToStaticMarkup(
      createElement(SiteCard, { site, contentAlign: 'center' }),
    );
    expect(catalogue).toContain('data-presentation="catalogue"');
    expect(catalogue).toContain('data-collapsible');
    expect(catalogue).toContain('<details');
    expect(catalogue).toContain('<summary');
    expect(catalogue).toContain('View full page');
    expect(catalogue).toContain('data-site-card-lightbox');
    expect(catalogue).toContain('data-lazy-site-details');
    expect(catalogue).not.toContain('data-site-details-body');

    const standalone = renderToStaticMarkup(
      createElement(SiteCard, {
        site,
        presentation: 'standalone',
        contentAlign: 'center',
      }),
    );
    expect(standalone).toContain('data-presentation="standalone"');
    expect(standalone).toContain('Forgotten Perimeter Coronation Platform');
    expect(standalone).toContain('data-site-details-body');
    expect(standalone).not.toContain('data-collapsible');
    expect(standalone).not.toContain('<details');
    expect(standalone).not.toContain('<summary');
    expect(standalone).not.toContain('View full page');
    expect(standalone).not.toContain('data-site-card-lightbox');
    expect(standalone).not.toContain('data-lazy-site-details');
  });
});
