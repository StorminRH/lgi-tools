import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/composition/AppHeader', () => ({
  AppHeader: () => createElement('header', { className: 'app-header' }, 'LGI'),
}));
vi.mock('@/components/composition/Footer', () => ({
  Footer: () => createElement('footer', null, 'footer'),
}));
vi.mock('@/components/composition/FeedbackButton', () => ({
  FeedbackButton: () => createElement('button', { type: 'button' }, 'Feedback'),
}));

describe('NotFoundContent 404 compositions', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('renders the existing 404 copy', async () => {
    const { NotFoundContent } = await import('@/components/composition/NotFoundContent');
    const html = renderToStaticMarkup(createElement(NotFoundContent));
    expect(html).toContain('Nothing on D-Scan');
    expect(html).toContain('404 · Signature lost');
    expect(html).toContain('Warp to home');
  });

  it('gives the root unmatched-URL path exactly one app-header landmark', async () => {
    const { NotFoundContent } = await import('@/components/composition/NotFoundContent');
    const { SiteFrame } = await import('@/components/composition/SiteFrame');
    const html = renderToStaticMarkup(
      createElement(SiteFrame, null, createElement(NotFoundContent)),
    );
    expect(html.match(/class="app-header"/g)).toHaveLength(1);
    expect(html).toContain('Nothing on D-Scan');
  });

  it('gives the (site) segment path exactly one app-header landmark', async () => {
    // Segment not-found inherits SiteFrame from the group layout; the body is
    // bare NotFoundContent under that single chrome layer.
    const { NotFoundContent } = await import('@/components/composition/NotFoundContent');
    const { SiteFrame } = await import('@/components/composition/SiteFrame');
    const html = renderToStaticMarkup(
      createElement(SiteFrame, null, createElement(NotFoundContent)),
    );
    expect(html.match(/class="app-header"/g)).toHaveLength(1);
    expect(html).toContain('Nothing on D-Scan');
  });
});
