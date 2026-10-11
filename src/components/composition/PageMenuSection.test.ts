import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => null }));

import { PageMenuProvider } from '@/components/composition/PageMenuProvider';
import { PageMenuSection } from '@/components/composition/PageMenuSection';

function renderAt(pathname: string): string {
  return renderToStaticMarkup(
    createElement(PageMenuProvider, { pathname }, createElement(PageMenuSection)),
  );
}

test('PageMenuSection renders enum and boolean controls under the default or declared title', () => {
  const sites = renderAt('/sites');
  expect(sites).toContain('Page settings');
  expect(sites).not.toContain('Map settings');
  expect(sites).toContain('View');
  expect(sites).toContain('cards');
  expect(sites).toContain('table');
  expect(sites).toContain('aria-pressed="true"');

  const atlas = renderAt('/atlas');
  expect(atlas).toContain('Map settings');
  expect(atlas).not.toContain('Page settings');
  expect(atlas).toContain('Camera follow');
  expect(atlas).toContain('role="switch"');
  expect(atlas).toContain('aria-checked="false"');
});

test('PageMenuSection renders nothing for unmatched or strip-only routes', () => {
  expect(renderAt('/skills')).toBe('');
  expect(renderAt('/industry/jobs')).toBe('');
});

test('PageMenuSection nests page-owned controls under the settings header', () => {
  const markup = renderToStaticMarkup(
    createElement(
      PageMenuProvider,
      { pathname: '/atlas' },
      createElement(PageMenuSection, null, createElement('div', { 'data-tracking': '' })),
    ),
  );
  expect(markup.indexOf('Map settings')).toBeLessThan(markup.indexOf('data-tracking'));
  expect(markup.indexOf('Camera follow')).toBeLessThan(markup.indexOf('data-tracking'));
});
