import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import RootNotFound from '@/app/not-found';
import SiteLayout from '@/app/(site)/layout';
import SiteNotFound from '@/app/(site)/not-found';

vi.mock('@/components/composition/AppHeader', () => ({
  AppHeader: () => createElement('header', null, 'Site header'),
}));

vi.mock('@/components/composition/Footer', () => ({
  Footer: () => createElement('footer', null, 'Site footer'),
}));

vi.mock('@/components/composition/FeedbackButton', () => ({
  FeedbackButton: () => null,
}));

describe('NotFoundContent compositions', () => {
  it('keeps the existing copy and yields one header for both 404 paths', () => {
    const rootMarkup = renderToStaticMarkup(createElement(RootNotFound));
    const groupMarkup = renderToStaticMarkup(
      createElement(SiteLayout, null, createElement(SiteNotFound)),
    );

    for (const markup of [rootMarkup, groupMarkup]) {
      expect(markup).toContain('Nothing on D-Scan');
      expect(markup).toContain('Warp to home');
      expect(markup.match(/<header/g)).toHaveLength(1);
    }
  });
});
