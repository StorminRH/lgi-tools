import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => null }));

import { PageMenuProvider } from '@/components/composition/PageMenuProvider';
import { PageMenuSection } from '@/components/composition/PageMenuSection';
import { __resetPageSettings, registerPageSettings } from '@/platform/page-settings';

function renderAt(pathname: string): string {
  return renderToStaticMarkup(
    createElement(PageMenuProvider, { pathname }, createElement(PageMenuSection)),
  );
}

beforeEach(() => __resetPageSettings());

test('PageMenuSection renders enum and boolean controls with declared titles', () => {
  registerPageSettings({
    route: '/sites',
    controls: [{ key: 'sites.view', placement: 'section' }],
  });
  const sites = renderAt('/sites');
  expect(sites).toContain('Page settings');
  expect(sites).toContain('view');
  expect(sites).toContain('cards');
  expect(sites).toContain('table');
  expect(sites).toContain('aria-pressed="true"');

  __resetPageSettings();
  registerPageSettings({
    route: '/atlas',
    title: 'Map settings',
    controls: [{ key: 'atlas.cameraFollow', placement: 'section' }],
  });
  const atlas = renderAt('/atlas');
  expect(atlas).toContain('Map settings');
  expect(atlas).toContain('camera follow');
  expect(atlas).not.toContain('auto layout');
  expect(atlas).toContain('role="switch"');
  expect(atlas).toContain('aria-checked="false"');

  __resetPageSettings();
  registerPageSettings({
    route: '/sites',
    title: 'Sites',
    controls: [{ key: 'sites.view', placement: 'section' }],
  });
  expect(renderAt('/sites')).toContain('Sites');
});

test('PageMenuSection renders nothing for unmatched or strip-only routes', () => {
  registerPageSettings({
    route: '/sites',
    controls: [{ key: 'sites.view', placement: 'section' }],
  });
  expect(renderAt('/skills')).toBe('');

  __resetPageSettings();
  registerPageSettings({ route: '/jobs', strip: { surfaceId: 'jobs' } });
  expect(renderAt('/jobs')).toBe('');
});
